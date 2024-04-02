import { FileEntry } from "./parser/linker.js";

export function printTransformer(f: FileEntry) {
	let lines = f.content.split("\n");
	lines = lines.map(l => {
		const isPrintNumber = l.includes("print(");
		const isPrintChar = l.includes("printc(");

		if (!isPrintNumber && !isPrintChar) return l;
		const memAddr = isPrintNumber ? 65537 : 65538;
		const spliceLen = isPrintNumber ? 6 : 7;

		const idx = l.indexOf(isPrintNumber ? "print(" : "printc(");
		const endIdx = l.lastIndexOf(")");
		const printArgs = l
			.substring(idx + spliceLen, endIdx)
			.split(",")
			.map(a => a.trim());

		let result = "";

		printArgs.forEach(arg => {
			result += `write(${memAddr}, ${arg});`;
		});

		return result;
	});

	f.content = lines.join("\n");
}
