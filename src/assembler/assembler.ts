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
		this.removeComments();
		this.parseLabels();
	}

	public getPreprocessedFile() {
		return this.lines.join("\n");
	}

	private removeComments() {
		this.lines = this.lines.filter(l => !l.startsWith("#"));
		this.lines = this.lines.map(l => l.split("#")[0].trim()).filter(l => l.length > 0);
	}

	private parseLabels() {
		let address = 0;
		this.lines.forEach((line, index) => {
			if (!line.startsWith(":")) return address++;

			const label = line.slice(1).split(" ")[0];
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

		this.lines = this.lines.filter(l => l.length > 0);
	}

	private parseDefines() {
		this.lines.forEach((line, index) => {
			if (!line.startsWith("#define")) return;

			const match = line.match(/#define (\w+) ([\w\s\d]+)/);
			const name = match[1];
			const value = match[2].trim();

			if (this.defines[name]) throw new Error(`Duplicate define ${name} on line ${index + 1}`);
			this.defines[name] = value;
		});

		// Remove defines from lines
		this.lines = this.lines.filter(l => !l.startsWith("#define"));
		const defines = Object.keys(this.defines);

		// Replace defines with values
		for (let i = 0; i < this.lines.length; i++) {
			const line = this.lines[i];

			const parts = line.split(" ").map(p => {
				if (defines.includes(p.trim())) return this.defines[p];
				if (p.startsWith(">") && defines.includes(p.slice(1).trim())) return ">" + this.defines[p.slice(1)];
				return p;
			});

			this.lines[i] = parts.join(" ");
		}
	}

	public compile(out?: string) {
		let result = "";
		this.lines.forEach((line, index) => {
			const [op, ...args] = line.split(" ");
			if (op.startsWith(">")) {
				// Debug
				result += `0x${hex(0, 64)} 0x${hex(0, 64)} # ${line}\n`;
				return;
			}

			const instr = instructions.find(instr => instr.name == op);
			if (!instr) throw new Error(`Unknown instruction ${op} on line ${index + 1}`);

			const { values, types } = this.parseArgs(args, instr);
			const opAndArgTypes = instr.opcode | (types[0] << 8) | (types[1] << 11) | (types[2] << 14);

			const lower = values[0] + hex(opAndArgTypes, 32);
			const upper = values[2] + values[1];
			result += `0x${lower} 0x${upper} # ${line}\n`;
		});

		if (out) {
			fs.writeFileSync(out, result);
		}

		return result;
	}

	private parseArgs(args: string[], instruction: Instruction) {
		const argResult: string[] = [hex(0, 32), hex(0, 32), hex(0, 32)];
		const argTypes = [0, 0, 0];

		instruction.argMap.forEach((arg, index) => {
			const { value, type } = this.parseArgument(args[index]);
			argResult[arg] = value;
			argTypes[arg] = type;
		});

		return { values: argResult, types: argTypes };
	}

	private parseArgument(arg: string): { value: string; type: number } {
		const fl = arg[0];
		if (fl == "R") {
			const register = parseInt(arg.slice(1));
			if (isNaN(register)) throw new Error(`Invalid register ${arg}`);

			return { value: hex(register, 32), type: ArgType.Register };
		}

		if (fl == "M") {
			const value = parseInt(arg.slice(1));
			if (isNaN(value)) throw new Error(`Invalid memory address ${arg}`);

			return { value: hex(value, 32), type: ArgType.Memory };
		}

		let value = parseInt(arg);
		if (isNaN(value)) throw new Error(`Invalid immediate value ${arg}`);
		if (value < 0) {
			// Create twos complement
			const bin = Math.abs(value)
				.toString(2)
				.padStart(32, "0")
				.split("")
				.map(b => (b == "0" ? "1" : "0"))
				.join("");
			const result = hex(parseInt(bin, 2) + 1, 32);
			return { value: result, type: ArgType.Immediate };

			// let upper = parseInt(bin.substring(0, 16), 2);
			// let lower = parseInt(bin.substring(16), 2);
			// console.log({ lower: bin.substring(16), upper: bin.substring(0, 16) });
			// console.log({ lower, upper });
			// lower++;
			// if (lower > 2 ** 16) {
			// 	upper++;
			// 	lower = 0;
			// }

			// console.log({ lower: hex(lower, 16), upper: hex(upper, 16) });
			// const result = hex(upper, 16) + hex(lower, 16);
		}

		return { value: hex(value, 32), type: ArgType.Immediate };
	}
}

export { Assembler };
