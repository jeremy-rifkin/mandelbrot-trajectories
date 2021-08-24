import { colors } from "./colors";
import { Complex, CustomMouseEvent, MemoryCanvas, rgbToHex, createElement, hexToRgb } from "./utils";
import "./style.scss";

const canvas: HTMLCanvasElement = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const img = document.getElementById("i") as HTMLImageElement;
const colors_display = document.getElementById("colors_display")!;
const memory_canvas = new MemoryCanvas();

type swatch = {
	readonly color: [number, number, number],
	readonly e: HTMLElement
}

var swatches: swatch[] = [];
var current_swatch: HTMLElement | null = null;

const xmin = -2.5;
const xmax = 1;
const ymin = -1;
const ymax = 1;

function render(e: CustomMouseEvent) {
	const w = (canvas as HTMLCanvasElement).width  = img.width;
	const h = (canvas as HTMLCanvasElement).height = img.height;
	// do tracer
	ctx.strokeStyle = "#00ff00";
	const [mouse_x, mouse_y] = [e.layerX, e.layerY];
	const c_to_p = (c: Complex): [number, number] => {
		const px = (c.i - xmin) * w / (xmax - xmin);
		const py = (c.j - ymin) * h / (ymax - ymin);
		return [px, py];
	};
	const c = new Complex(
		xmin + mouse_x / w * (xmax - xmin),
		ymin + mouse_y / h * (ymax - ymin)
	);
	let z = new Complex(0, 0);
	ctx.beginPath();
	ctx.moveTo(...c_to_p(c));
	for(let i = 0; i < 200; i++) {
		z = z.mult(z).plus(c);
		ctx.lineTo(...c_to_p(z));
		// todo: toggle to draw dots at vertices?
		if(z.norm >= 8) break;
	}
	ctx.stroke();
	// highlight swatch
	const [img_x, img_y] = [mouse_x / w * img.naturalWidth, mouse_y / w * img.naturalWidth];
	const pixel = memory_canvas.pixel_at(img_x, img_y);
	const tuple_diff = (a: [number, number, number], b: [number, number, number]) =>
	            	   Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) + Math.abs(b[2] - a[2]);
	const swatch = swatches.reduce(function(prev_best, swatch) {
		return tuple_diff(swatch.color, pixel) < tuple_diff(prev_best.color, pixel) ? swatch : prev_best;
	});
	if(current_swatch != null) current_swatch.classList.remove("accented");
	if(tuple_diff(swatch.color, pixel) > 100) {
		current_swatch = null;
		return;
	}
	swatch.e!.classList.add("accented");
	current_swatch = swatch.e!;
}

function display_colors() {
	for(const [i, color] of colors.entries()) {
		const e = <div className="swatch">
			<div style={{background: color}}></div>
			<div>{i + 1}</div>
		</div>;
		//swatches.set(color, e as unknown as HTMLElement);
		swatches.push({color: hexToRgb(color), e: e as unknown as HTMLElement});
		colors_display.appendChild(e as unknown as Node);
	}
}

display_colors();

canvas.addEventListener("mousemove", e => render(e as CustomMouseEvent), false);
canvas.addEventListener("mouseleave", () => {
	ctx.clearRect(0, 0, img.width, img.height);
	if(current_swatch != null) {
		current_swatch.classList.remove("accented");
		current_swatch = null;
	}
}, false);

img.addEventListener("load", () => {
	memory_canvas.load_image(img);
}, false);
