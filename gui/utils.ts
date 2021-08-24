const assert = console.assert;

// https://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb
function componentToHex(c: number) {
	const hex = c.toString(16);
	return hex.length == 1 ? "0" + hex : hex;
}
export function rgbToHex(r: number, g: number, b: number) {
	return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}
export function hexToRgb(hex: string): [number, number, number] {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r, g, b];
}

export class MemoryCanvas {
	readonly canvas: HTMLCanvasElement;
	readonly ctx: CanvasRenderingContext2D;
	constructor() {
		this.canvas = document.createElement("canvas");
		this.ctx = this.canvas.getContext("2d")!;
	}
	load_image(img: HTMLImageElement) {
		this.canvas.width = img.naturalWidth;
		this.canvas.height = img.naturalHeight;
		this.ctx.drawImage(img, 0, 0);
		return this;
	}
	pixel_at(x: number, y: number): [number, number, number] {
		const [r, g, b, _] = this.ctx.getImageData(x, y, 1, 1).data;
		return [r, g, b];
	}
}

export class Complex {
	_i: number;
	_j: number;
	constructor(i: number, j: number) {
		this._i = i;
		this._j = j;
	}
	get i() {
		return this._i;
	}
	set i(v) {
		this._i = v;
	}
	get j() {
		return this._j;
	}
	set j(v) {
		this._j = v;
	}
	get norm() {
		const { i, j } = this;
		return i * i + j * j;
	}
	mult(o: Complex) {
		const [a, b, c, d] = [this.i, this.j, o.i, o.j];
		return new Complex(a * c - b * d, a * d + b * c);
	}
	plus(o: Complex) {
		const [a, b, c, d] = [this.i, this.j, o.i, o.j];
		return new Complex(a + c, b + d);
	}
}

export interface CustomMouseEvent extends MouseEvent {
	readonly layerX: number;
	readonly layerY: number;
}

export interface AttributeCollection {
	readonly [name: string]: any;
}

// based on https://www.meziantou.net/write-your-own-dom-element-factory-for-typescript.htm
export function createElement(tagName: string, attributes: AttributeCollection | null, ...children: any[]) {
	if (tagName == "<></>") {
		return document.createDocumentFragment();
	}
	const element = document.createElement(tagName);
	if(attributes) {
		for(const [key, val] of Object.entries(attributes)) {
			if(key == "style") {
				assert(typeof val == "object");
				for(const [k, v] of Object.entries(val)) {
					element.style.setProperty(k, v as string);
				}
			} else if(key == "className") { // JSX does not allow class as a valid name
				assert(typeof val == "string");
				element.setAttribute("class", val as string);
			} else if(key.startsWith("on") && typeof val === "function") {
				element.addEventListener(key.substring(2), val as any);
			} else {
				// <input disable />      { disable: true }
				// <input type="text" />  { type: "text"}
				if (typeof val === "boolean" && val) {
					element.setAttribute(key, "");
				} else {
					element.setAttribute(key, val as string);
				}
			}
		}
	}
	for(const child of children) {
		appendChild(element, child);
	}
	return element;
}
function appendChild(parent: Node, child: any) {
	if(Array.isArray(child)) {
		for(const value of child) {
			appendChild(parent, value);
		}
	} else if(typeof child == "string") {
		parent.appendChild(document.createTextNode(child));
	} else if(child instanceof Node) {
		parent.appendChild(child);
	} else if(typeof child == "boolean") {
		// <>{condition && <a>Display when condition is true</a>}</>
	} else {
		parent.appendChild(document.createTextNode(String(child)));
	}
}
