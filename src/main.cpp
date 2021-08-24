#include <algorithm>
#include <assert.h>
#include <atomic>
#include <complex>
#include <mutex>
#include <optional>
#include <random>
#include <stdint.h>
#include <stdio.h>
#include <thread>
#include <vector>

#include "bmp.h"

typedef double fp;

// render parameters
constexpr int w = 1920; // * 2;
constexpr int h = 1080; // * 2;
constexpr fp xmin = -2.5;
constexpr fp xmax = 1;
constexpr fp ymin = -1;
constexpr fp ymax = 1;
constexpr fp dx = (xmax - xmin) / w;
constexpr fp dy = (ymax - ymin) / h;

// mandelbrot parameters
constexpr int max_iterations = 10000; // 2*7000;
constexpr int max_period = 30;
constexpr fp threshold = 1e-6; // 1e-9 is too far, leads to lots of noise
constexpr fp threshold_squared = threshold * threshold;
// works best with a prime number due to mandelbrot structure (e.g. all colors appearing in the
// period 2 bulb will be at an odd index because all bulbs connecting to the period 2 bulb have
// even indices)
constexpr int interleave_factor = 17;

// anti-aliasing settings
constexpr bool AA = true;
constexpr int AA_samples = 30;
constexpr int border_radius = 5;
constexpr int border_radius_secondary = 2;
thread_local std::mt19937 rng;
std::uniform_real_distribution<fp> ux(-dx/2, dx/2);
std::uniform_real_distribution<fp> uy(-dy/2, dy/2);

// color starts/stops for the color table
constexpr float h_start = 200;
constexpr float h_stop = 330;

constexpr const char* color_output = "gui/colors.ts";
constexpr const char* render_output = "render.bmp";

pixel_t colors[max_period];
[[gnu::constructor]] void init_colors() {
	// I was just messing around here with colors. This is all largely useless and it'd be good to
	// get a better color scheme later.
	// Make an in-order array of swatches, do interleave copy into colors
	// in-place interleave is possible but hard (and even harder to generalize)
	pixel_t swatches[max_period];
	let dh = (h_stop - h_start) / max_period;
	for(std::size_t i = 0, j = std::size(colors); j--; i++) {
		swatches[i] = hsl_to_rgb(h_stop - j * dh, 0.7, 0.5);
	}
	// interleave
	constexpr int N = interleave_factor;
	constexpr int W = std::size(swatches) / N;
	// setup pointers to the swatches array
	pixel_t* pointers[N];
	for(let i = 0; i < N; i++) {
		pointers[i] = swatches + W * i;
	}
	// interleave main-body
	let i = 0;
	for(std::size_t j = 0; j < W; j++) {
		for(int k = 0; k < N; k++) {
			colors[i++] = *pointers[k]++;
		}
	}
	// remaining items
	while(pointers[N - 1] != swatches + std::size(swatches)) {
		colors[i++] = *pointers[N - 1]++;
	}
	// print to output file
	FILE* f = fopen(color_output, "w");
	fprintf(f, "export const colors = [\n");
	for(std::size_t i = 0; i < std::size(colors); i++) {
		let& c = colors[i];
		if(i < std::size(colors) - 1)
			fprintf(f, "\t\"#%02X%02X%02X\",\n", c.r, c.g, c.b);
		else
			fprintf(f, "\t\"#%02X%02X%02X\"\n", c.r, c.g, c.b);
	}
	fprintf(f, "];\n");
	fclose(f);
}

struct point_descriptor {
	bool escaped;
	int escape_time;
	int period;
	point_descriptor(bool escaped, int escape_time, int period) : escaped(escaped), escape_time(escape_time), period(period) {}
};

// memoization
atomic_optional<point_descriptor> points[w][h];
bool ms_mask[w][h];
bool aa_mask[w][h];

// returns cycles in orbit or none if the point is outside the set
point_descriptor mandelbrot(fp x, fp y) {
	std::complex<fp> c = std::complex<fp>(x, y);
	std::complex<fp> z = std::complex<fp>(0, 0);
	ring_buffer<std::complex<fp>, max_period> buff;
	for(int i = 0; i < max_iterations; i++) {
		z = z * z + c;
		if(std::norm(z) >= 4) {
			return {true, i, 0};
		}
		for(int i = (int)buff.size() - 1; i >= 0; i--) {
			if(std::norm(buff[i] - z) <= threshold*threshold) {
				return {false, 0, (int)buff.size() - i};
			}
		}
		buff.push(z);
	}
	return {false, 0, -1};
}

// So there's some interesting optimization stuff going on here.
// This logic is pulled out because I haven't wanted -ffast-math effecting this computation.
// Previously the function returned std::tuple<fp, fp>.
// But it turns out [[gnu::optimize("-fno-fast-math")]] or [[gnu::optimize("-O3")]] resulted in
// really bad codegen here when -ffast-math was provided on the command line (fine codegen
// with just -O3 and not -ffast-math) because the call to the std::tuple constructor could not be
// inlined as it did not have [[gnu::optimize("-fno-fast-math")]]. I find this cool but there's also
// no way I know of to deal with it other than creating a type that won't have a constructor to
// inline. https://godbolt.org/z/PffTGjbaY
// Todo: Though it's not a big deal, this function can't be inlined into its callsites because of
// the compiler trying to maintaining ffast-math consistency, is there a way to allow it to be? Will
// it be done during LTO?
struct not_a_tuple { fp i, j; };
[[gnu::optimize("-fno-fast-math")]]// don't want ffast-math messing with this particular computation
not_a_tuple get_coordinates(int i, int j) {
	return {xmin + ((fp)i / w) * (xmax - xmin), ymin + ((fp)j / h) * (ymax - ymin)};
}

pixel_t get_pixel(fp x, fp y) {
	if(let result = mandelbrot(x, y); !result.escaped) {
		let period = result.period;
		if(period == -1) {
			return 0;
		} else {
			assert(period > 0);
			assert(period <= max_period);
			return colors[period - 1];
		}
	} else {
		if(result.escape_time <= 100) {
			return 255;
		} else {
			return 0;
		}
	}
}

pixel_t sample(fp x, fp y) {
	if(AA) {
		int r = 0, g = 0, b = 0;
		for(int i = 0; i < AA_samples; i++) {
			let color = get_pixel(x + ux(rng), y + uy(rng));
			r += color.r;
			g += color.g;
			b += color.b;
		}
		return {(uint8_t)((fp)r/AA_samples), (uint8_t)((fp)g/AA_samples), (uint8_t)((fp)b/AA_samples)};
	} else {
		return get_pixel(x, y);
	}
}

void brute_force_worker(std::atomic_int* xj, BMP* bmp, int id) {
	int j;
	while((j = xj->fetch_add(1, std::memory_order_relaxed)) < h) {
		if(id == 0) printf("\033[1K\r%0.2f%%", (float)((fp)j / h * 100));
		if(id == 0) fflush(stdout);
		for(int i = 0; i < w; i++) {
			let [x, y] = get_coordinates(i, j);
			let color = sample(x, y);
			bmp->set(i, j, color);
		}
	}
}

int main() {
	assert(byte_swap(0x11223344) == 0x44332211);
	assert(byte_swap(pixel_t{0x11, 0x22, 0x33}) == (pixel_t{0x33, 0x22, 0x11}));
	BMP bmp = BMP(w, h);
	const int nthreads = std::thread::hardware_concurrency();
	printf("parallel on %d threads\n", nthreads);
	puts("starting brute force");
	std::vector<std::thread> vec(nthreads);
	std::atomic_int j = 0;
	for(int i = 0; i < nthreads; i++) {
		vec[i] = std::thread(brute_force_worker, &j, &bmp, i);
	}
	for(let& t : vec) {
		t.join();
	}
	puts("\033[1K\rfinished");
	bmp.write(render_output);
}
