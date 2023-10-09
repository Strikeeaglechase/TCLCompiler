import fs from "fs";
import path from "path";

import { Instruction, instructions } from "./instructions.js";

enum ArgType {
	Immediate = 0x01,
	Register = 0x02,
	Memory = 0x03,
	Pop = 0x04,
	PopAddr = 0x05,
	RegRef = 0x06
}

const bin = (v: number, d = 8) => v.toString(2).padStart(d, "0");
const hex = (v: number, d = 8) => v.toString(16).padStart(d / 4, "0");

class Assembler {
	private lines: string[] = [];
	private labels: { [key: string]: number } = {};
	private defines: { [key: string]: string } = {};

	constructor(source: string) {
		const file = fs.readFileSync(source, "utf-8");
		this.lines = file
			.split("\n")
			.map(l => l.trim())
			.filter(l => l.length > 0);

		this.parseDefines();
		this.parseLabels();
	}

	private parseLabels() {
		let address = 0;
		this.lines.forEach((line, index) => {
			if (!line.startsWith(":")) return address++;

			const label = line.slice(1);
			if (this.labels[label]) throw new Error(`Duplicate label ${label} on line ${index + 1}`);
			this.labels[label] = address;
		});

		// Remove labels from lines
		this.lines = this.lines.filter(l => !l.startsWith(":"));
		const labels = Object.keys(this.labels);

		// Replace labels with addresses
		this.lines.forEach((line, index) => {
			const parts = line.split(" ");
			parts.forEach((part, partIndex) => {
				if (labels.includes(part)) parts[partIndex] = this.labels[part].toString();
			});
			this.lines[index] = parts.join(" ");
		});
	}

	private parseDefines() {
		this.lines.forEach((line, index) => {
			if (!line.startsWith("#define")) return;

			const [_, name, value] = line.split(" ");
			if (this.defines[name]) throw new Error(`Duplicate define ${name} on line ${index + 1}`);
			this.defines[name] = value;
		});

		// Remove defines from lines
		this.lines = this.lines.filter(l => !l.startsWith("#define"));
		const defines = Object.keys(this.defines);

		// Replace defines with values
		this.lines.forEach((line, index) => {
			const parts = line.split(" ");
			parts.forEach((part, partIndex) => {
				if (defines.includes(part)) parts[partIndex] = this.defines[part];
			});
			this.lines[index] = parts.join(" ");
		});
	}

	public compile(out: string) {
		let result = "";
		let debugResult = "";
		this.lines.forEach((line, index) => {
			const [op, ...args] = line.split(" ");
			const instr = instructions.find(instr => instr.name == op);
			if (!instr) throw new Error(`Unknown instruction ${op} on line ${index + 1}`);

			const { values, types } = this.parseArgs(args, instr);
			const opAndArgTypes = instr.opcode | (types[0] << 8) | (types[1] << 11) | (types[2] << 14);

			const lower = hex(values[0], 32) + hex(opAndArgTypes, 32);
			const upper = hex(values[2], 32) + hex(values[1], 32);
			result += `0x${lower} 0x${upper} # ${line}\n`;

			const instrBin = bin(instr.opcode, 8);
			const AT = bin(types[0], 3);
			const BT = bin(types[1], 3);
			const DT = bin(types[2], 3);
			const A = hex(values[0], 0);
			const B = hex(values[1], 0);
			const D = hex(values[2], 0);
			debugResult += `Op: ${instrBin} AT: ${AT} BT: ${BT} DT: ${DT}  A: ${A} B: ${B} D: ${D}\n`;
		});

		fs.writeFileSync(out, result);

		const name = path.basename(out);
		fs.writeFileSync(`../debug/${name}`, debugResult);
	}

	private parseArgs(args: string[], instruction: Instruction) {
		const argResult = [0, 0, 0];
		const argTypes = [0, 0, 0];

		instruction.argMap.forEach((arg, index) => {
			const { value, type } = this.parseArgument(args[index]);
			argResult[arg] = value;
			argTypes[arg] = type;
		});

		return { values: argResult, types: argTypes };
	}

	private parseArgument(arg: string): { value: number; type: number } {
		const fl = arg[0];
		if (fl == "R") {
			const register = parseInt(arg.slice(1));
			if (isNaN(register)) throw new Error(`Invalid register ${arg}`);

			return { value: register, type: ArgType.Register };
		}

		if (fl == "M") {
			const value = parseInt(arg.slice(1));
			if (isNaN(value)) throw new Error(`Invalid memory address ${arg}`);

			return { value, type: ArgType.Memory };
		}

		const value = parseInt(arg);
		if (isNaN(value)) throw new Error(`Invalid immediate value ${arg}`);

		return { value, type: ArgType.Immediate };
	}
}

const asm = new Assembler("../source/assembly.tca");
asm.compile("../out.bin");

export { Assembler };
