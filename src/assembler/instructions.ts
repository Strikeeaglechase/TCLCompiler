interface Instruction {
	name: string;
	opcode: number;
	argMap: ArgLocs[];
}

enum ArgLocs {
	ArgA,
	ArgB,
	Dest
}

const instructions: Instruction[] = [
	{ name: "nop", opcode: 0x00, argMap: [] },
	{ name: "halt", opcode: 0x01, argMap: [] },
	{ name: "mov", opcode: 0x02, argMap: [ArgLocs.ArgA, ArgLocs.Dest] },
	{ name: "movif", opcode: 0x03, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "movifn", opcode: 0x04, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "add", opcode: 0x06, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "sub", opcode: 0x07, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "mul", opcode: 0x08, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "div", opcode: 0x09, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "mod", opcode: 0x0a, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "and", opcode: 0x0b, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "or", opcode: 0x0c, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "xor", opcode: 0x0d, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "not", opcode: 0x0e, argMap: [ArgLocs.ArgA, ArgLocs.Dest] },
	{ name: "shl", opcode: 0x0f, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "shr", opcode: 0x10, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "cmpeq", opcode: 0x11, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "cmpne", opcode: 0x12, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "cmplt", opcode: 0x13, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "cmple", opcode: 0x14, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "readoff", opcode: 0x15, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "writeoff", opcode: 0x16, argMap: [ArgLocs.ArgA, ArgLocs.ArgB, ArgLocs.Dest] },
	{ name: "push", opcode: 0x17, argMap: [ArgLocs.ArgA] },
	{ name: "pop", opcode: 0x18, argMap: [ArgLocs.Dest] },
	{ name: "call", opcode: 0x19, argMap: [ArgLocs.ArgA, ArgLocs.Dest] }
];

export { instructions, Instruction, ArgLocs };
