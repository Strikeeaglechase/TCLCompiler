import { Assembler } from "./assembler.js";

const pc = 1;
const sp = 2;
const fp = 3;
const printAddr = 65536;

interface InstructionHandler {
	name: string;
	handler: (this: TCEmulator, op: string, args: string[]) => void;
}
const handlers: InstructionHandler[] = [];
const p = (handler: InstructionHandler) => handlers.push(handler);

// nop
p({ name: "nop", handler: function () {} });
// halt
p({
	name: "halt",
	handler: function () {
		this.running = false;
	}
});
// mov
p({
	name: "mov",
	handler: function (op, args) {
		this.destRef(args[1]).set(args[0]);
	}
});
// movif
p({
	name: "movif",
	handler: function (op, args) {
		if (this.getArg(args[1])) this.destRef(args[2]).set(args[0]);
	}
});
// movifn
p({
	name: "movifn",
	handler: function (op, args) {
		if (!this.getArg(args[1])) this.destRef(args[2]).set(args[0]);
	}
});
// add
p({
	name: "add",
	handler: function (op, args) {
		this.math(args, "+");
	}
});
// sub
p({
	name: "sub",
	handler: function (op, args) {
		this.math(args, "-");
	}
});
// mul
p({
	name: "mul",
	handler: function (op, args) {
		this.math(args, "*");
	}
});
// div
p({
	name: "div",
	handler: function (op, args) {
		this.math(args, "/");
	}
});
// mod
p({
	name: "mod",
	handler: function (op, args) {
		this.math(args, "%");
	}
});
// and
p({
	name: "and",
	handler: function (op, args) {
		this.math(args, "&");
	}
});
// or
p({
	name: "or",
	handler: function (op, args) {
		this.math(args, "|");
	}
});
// xor
p({
	name: "xor",
	handler: function (op, args) {
		this.math(args, "^");
	}
});
// not
p({
	name: "not",
	handler: function (op, args) {
		this.destRef(args[1]).setDirect(~this.getArg(args[0]));
	}
});
// shl
p({
	name: "shl",
	handler: function (op, args) {
		this.math(args, "<<");
	}
});
// shr
p({
	name: "shr",
	handler: function (op, args) {
		this.math(args, ">>");
	}
});
// cmpeq
p({
	name: "cmpeq",
	handler: function (op, args) {
		this.destRef(args[2]).setDirect(this.getArg(args[0]) === this.getArg(args[1]) ? 1 : 0);
	}
});
// cmpne
p({
	name: "cmpne",
	handler: function (op, args) {
		this.destRef(args[2]).setDirect(this.getArg(args[0]) !== this.getArg(args[1]) ? 1 : 0);
	}
});
// cmplt
p({
	name: "cmplt",
	handler: function (op, args) {
		this.destRef(args[2]).setDirect(this.getArg(args[0]) < this.getArg(args[1]) ? 1 : 0);
	}
});
// cmple
p({
	name: "cmple",
	handler: function (op, args) {
		this.destRef(args[2]).setDirect(this.getArg(args[0]) <= this.getArg(args[1]) ? 1 : 0);
	}
});
// readoff
p({
	name: "readoff",
	handler: function (op, args) {
		const baseAddress = this.getArg(args[0]);
		const offset = this.getArg(args[1]);
		this.destRef(args[2]).setDirect(this.readMem(baseAddress + offset));
	}
});
// writeoff
p({
	name: "writeoff",
	handler: function (op, args) {
		const value = this.getArg(args[0]);
		const baseAddress = this.getArg(args[1]);
		const offset = this.getArg(args[2]);
		this.writeMem(baseAddress + offset, value);
	}
});
// push
p({
	name: "push",
	handler: function (op, args) {
		// this.memory[this.registers[sp]++] = this.getArg(args[0]);
		this.writeMem(this.registers[sp]++, this.getArg(args[0]));
	}
});
// pop
p({
	name: "pop",
	handler: function (op, args) {
		// this.destRef(args[0]).setDirect(this.memory[--this.registers[sp]]);
		this.destRef(args[0]).setDirect(this.readMem(--this.registers[sp]));
	}
});
// call
p({
	name: "call",
	handler: function (op, args) {
		this.writeMem(this.registers[fp], this.registers[pc]);
		this.destRef(args[1]).set(args[0]);
	}
});

class MemoryMappedIO {
	private addressWriteHandlers: { address: number; handler: (addr: number, value: number) => void }[] = [];
	private addressReadHandlers: { address: number; handler: (addr: number) => number }[] = [];

	private writeHandlers: ((addr: number, value: number) => void)[] = [];
	private readHandlers: ((addr: number) => number)[] = [];

	constructor(private low: number, private high: number) {}

	public onWriteTo(addr: number, handler: (addr: number, value: number) => void) {
		this.addressWriteHandlers.push({ address: addr, handler });
	}

	public onWriteToRange(handler: (addr: number, value: number) => void) {
		this.writeHandlers.push(handler);
	}

	public onReadFrom(addr: number, handler: (addr: number) => number) {
		this.addressReadHandlers.push({ address: addr, handler });
	}

	public onRead(handler: (addr: number) => number) {
		this.readHandlers.push(handler);
	}

	public handleWrite(addr: number, value: number) {
		const address = addr - this.low;
		let hasDirect = false;
		this.addressWriteHandlers.forEach(handler => {
			if (handler.address != address) return;
			handler.handler(addr, value);
			hasDirect = true;
		});

		if (hasDirect) return;

		this.writeHandlers.forEach(handler => handler(address, value));
	}

	public handleRead(addr: number) {
		const address = addr - this.low;
		let hasDirect = false;
		this.addressReadHandlers.forEach(handler => {
			if (handler.address != address) return;
			handler.handler(address);
			hasDirect = true;
		});

		if (hasDirect) return;

		return this.readHandlers[0](address);
	}

	public isInRange(addr: number) {
		return addr >= this.low && addr <= this.high;
	}
}

class TCEmulator {
	public registers: number[] = new Array(10).fill(0);
	private regWrites: boolean[] = new Array(10).fill(false);
	private memory: number[] = [];
	private mappedDevices: MemoryMappedIO[] = [];

	private code: string[] = [];
	private ticks = 0;
	public running = true;

	constructor(source: string) {
		const assembler = new Assembler(source);
		this.code = assembler.getPreprocessedFile().split("\n");

		assembler.compile("../out.bin");

		this.loadMappedDevices();
	}

	private loadMappedDevices() {
		const outputDevice = new MemoryMappedIO(printAddr, printAddr + 1);
		outputDevice.onWriteTo(0, (addr, value) => {
			console.log(`Write: ${value}`);
		});
		outputDevice.onWriteTo(1, (addr, value) => {
			console.log(`DBG Write: ${value}`);
		});

		this.mappedDevices.push(outputDevice);
	}

	public run() {
		while (this.running) this.tick();

		console.log(`Program finished in ${this.ticks} ticks`);
		console.log(`PC: ${this.registers[pc]}`);
		console.log(`SP: ${this.registers[sp]}`);
		// console.log(this.registers);
	}

	private tick() {
		const line = this.code[this.registers[pc]];
		// console.log(this.registers[pc]);
		// console.log(this.memory);
		// console.log(this.registers.join(", "));

		if (!line) {
			this.running = false;
			console.log(`Attempted to execute an invalid address: ${this.registers[pc]}`);
			return;
		}
		const [op, ...args] = line.split(" ");

		if (op.startsWith(">")) {
			// Debug
			const ref = this.getArg(op.slice(1));
			console.log(`Debug at ${this.registers[pc]}: ${op.slice(1)} = ${ref}`);
			this.endOfTick();
			return;
		}

		const handler = handlers.find(handler => handler.name === op);
		if (!handler) throw new Error(`Unknown opcode ${op}`);
		handler.handler.call(this, op, args);
		this.endOfTick();
	}

	private endOfTick() {
		if (!this.regWrites[pc]) this.registers[pc]++;
		this.ticks++;
		this.regWrites = new Array(10).fill(false);
	}

	public getArg(arg: string) {
		if (arg.startsWith("R")) return this.registers[parseInt(arg.slice(1))];
		if (arg.startsWith("M")) return this.memory[parseInt(arg.slice(1))];
		return parseInt(arg);
	}

	public destRef(arg: string) {
		const targetIsMem = arg.startsWith("M");
		const target = targetIsMem ? this.memory : this.registers;
		const index = parseInt(arg.slice(1));

		return {
			set: (value: string) => {
				if (targetIsMem) return this.writeMem(index, this.getArg(value));
				else this.regWrites[index] = true;

				target[index] = this.getArg(value);
			},
			setDirect: (value: number) => {
				if (targetIsMem) return this.writeMem(index, value);
				else this.regWrites[index] = true;

				target[index] = value;
			},
			get: () => target[index]
		};
	}

	public readMem(addr: number) {
		const device = this.mappedDevices.find(device => device.isInRange(addr));
		if (device) return device.handleRead(addr);

		return this.memory[addr];
	}

	public writeMem(addr: number, value: number) {
		const device = this.mappedDevices.find(device => device.isInRange(addr));
		if (device) return device.handleWrite(addr, value);

		this.memory[addr] = value;
	}

	public math(args: string[], operator: string) {
		const lhs = this.getArg(args[0]);
		const rhs = this.getArg(args[1]);
		const result = eval(`${lhs} ${operator} ${rhs}`);
		this.destRef(args[2]).setDirect(result);
	}
}

// const emulator = new TCEmulator("../source/assembly.tca");
// emulator.run();

export { TCEmulator };
