import {
	AST,
	ASTBinaryOperation,
	ASTFunctionCall,
	ASTFunctionDeclaration,
	ASTIfStatement,
	ASTInlineArrayAssignment,
	ASTInlineStructAssignment,
	ASTNumber,
	ASTProg,
	ASTReference,
	ASTReturn,
	ASTStructStatement,
	ASTType,
	ASTVariableAssignment,
	ASTVariableDeclaration
} from "../parser/ast.js";
import { builtInFunctions } from "./builtInFunctions.js";

interface Compiler {
	compile(ast: ASTProg): string;
}

interface StructType {
	name: string;
	fields: { type: Type; name: string; offset: number }[];
	size: number;
}

interface BuiltInType {
	name: string;
	size: number;
}

type Type = StructType | BuiltInType;

interface Variable {
	name: string;
	type: Type;
	offset: number;
}

class Context {
	public variables: Record<string, Variable> = {};
	private currentOffset = 0;
	constructor(public parent: Context | null = null) {
		if (parent) {
			this.currentOffset = parent.currentOffset;
		}
	}

	public getVariable(name: string): Variable {
		if (this.variables[name]) return this.variables[name];
		if (this.parent) return this.parent.getVariable(name);

		throw new Error(`Unknown variable: ${name}`);
	}

	public addVariable(name: string, type: Type) {
		this.variables[name] = { name, type, offset: this.currentOffset };
		this.currentOffset += type.size;

		return this.variables[name];
	}
}

const builtInTypes: Record<string, Type> = {
	int: { name: "int", size: 1 },
	void: { name: "void", size: 0 }
};

const debug_logs = false;

class JSCompiler implements Compiler {
	// private code: string = "";
	public types: Record<string, Type> = builtInTypes;
	public context: Context = new Context();
	private functionInfos: Record<string, { argSize: number; returnType: Type }> = {};
	private numberOfArgumentRegistersUsed = 0;

	private getSetupCode() {
		let code = "";
		code += `let fp = 0;\n`;
		code += `let sp = fp;\n`;
		code += `const stack = [];\n`;
		code += `const push = (value) => stack[sp++] = value;\n`;
		code += `const pop = () => stack[--sp];\n`;
		code += `const ref = (idx) => stack[idx];\n`;
		code += `const set = (idx, value) => stack[idx] = value;\n`;
		code += `let regA = 0;\n`;
		code += `let regB = 0;\n`;
		code += `let regC = 0;\n`;
		code += `let regD = 0;\n`;
		code += `const argReg = [];\n`;

		code += `\n`;

		return code;
	}

	private getTearDownCode() {
		let code = "";
		code += `console.log({ stack, sp, fp, regA, regB, regC });\n`;

		return code;
	}

	public compile(ast: ASTProg): string {
		let code = "";

		code += this.getSetupCode();
		ast.body.forEach(node => (code += this.handleNode(node)));
		code += this.getTearDownCode();

		return code;
	}

	public handleNode(node: AST): string {
		let prefix = `/*${node.type}*/ `;
		const exec = () => {
			switch (node.type) {
				case ASTType.IfStatement:
					return this.handleIfStatement(node);
				case ASTType.FunctionDeclaration:
					return this.handleFunctionDeclaration(node);
				case ASTType.Number:
					return this.handleNumberLiteral(node);
				case ASTType.BinaryOperation:
					return this.handleBinaryExpression(node);
				case ASTType.Reference:
					return this.getVariableReference(node);
				// case ASTType.Return:
				// 	return this.handleReturnStatement(node);
				case ASTType.FunctionCall:
					return this.handleFunctionCall(node);
				case ASTType.VariableDeclaration:
					return this.handleVariableDeclaration(node);
				case ASTType.StructStatement:
					return this.handleStructDeclaration(node);
				case ASTType.VariableAssignment:
					return this.handleVariableAssignment(node);
				default:
					throw new Error(`Unknown node type: ${node.type}`);
			}
		};

		return prefix + exec();
	}

	private getVariableReference(node: ASTReference): string {
		const { offset, type } = this.getReferenceOffset(node);

		let code = "";
		for (let i = 0; i < type.size; i++) {
			code += `regC = ref(fp + ${offset} + ${i}); // ${this.debugReference(node)}\n`;
			code += `push(regC);\n`;
		}

		if (debug_logs) code += `console.log("ref ${this.debugReference(node)}: " + regC);\n`;
		return code;
	}

	private handleVariableAssignment(node: ASTVariableAssignment): string {
		const { offset, type } = this.getReferenceOffset(node.reference);

		let code = "";
		code += this.handleNode(node.expression);
		for (let i = 0; i < type.size; i++) {
			code += `regC = pop();\n`;
			code += `set(fp + ${offset} + ${type.size - i - 1}, regC); // Assign ${this.debugReference(node.reference)}\n`;
		}
		return code;
	}

	private handleStructDeclaration(structDecl: ASTStructStatement): string {
		const type: Type = {
			name: structDecl.name,
			fields: [],
			size: 0
		};

		let idx = 0;
		structDecl.keys.forEach(field => {
			const fieldSize = this.resolveType(field.type);
			type.fields.push({ type: fieldSize, name: field.name, offset: idx });
			idx += fieldSize.size;
		});

		type.size = idx;

		this.types[type.name] = type;

		return "\n";
	}

	private resolveType(ref: ASTReference | string) {
		let type: Type;
		if (typeof ref == "string") {
			type = this.types[ref];
		} else {
			type = this.types[ref.key];
		}

		if (!type) throw new Error(`Unknown type: ${JSON.stringify(ref)}`);

		return type;
	}

	private handleInlineAssignment(variable: Variable, inline: ASTInlineArrayAssignment | ASTInlineStructAssignment): string {
		let code = "";
		if (inline.type == ASTType.InlineArrayAssignment) {
			inline.values.forEach((value, idx) => {
				code += this.handleNode(value);
				code += `regC = pop();\n`;
				code += `set(fp + ${variable.offset + idx * variable.type.size}, regC);\n`;
			});
		} else {
			inline.keys.forEach((key, idx) => {
				code += this.handleNode(key.value);
				// const keyType = (variable.type as StructType).fields.find(f => f.name == key.name);
				// if (!keyType) throw new Error(`Unknown field: ${key.name}`);
				const offset = this.resolveStructKeyOffset(key.name, variable.type as StructType);
				code += `regC = pop();\n`;
				code += `set(fp + ${variable.offset + offset}, regC);\n`;
			});
		}

		return code;
	}

	private resolveStructKeyOffset(tag: string, structType: StructType) {
		const parts = tag.split(".");
		let currentType = structType;
		let offset = 0;
		parts.forEach(part => {
			const field = currentType.fields.find(field => field.name == part);
			if (!field) throw new Error(`Unknown field: ${part}`);
			offset += field.offset;
			currentType = field.type as StructType;
		});

		return offset;
	}

	private handleVariableDeclaration(node: ASTVariableDeclaration): string {
		let code = "";
		const type = this.resolveType(node.varType);
		const variable = this.context.addVariable(node.name, type);
		code += `sp += ${variable.type.size}; // Space for ${node.name}\n`;
		if (node.expression.type == ASTType.InlineArrayAssignment || node.expression.type == ASTType.InlineStructAssignment) {
			code += this.handleInlineAssignment(variable, node.expression);
		} else {
			code += this.handleNode(node.expression);
			for (let i = 0; i < type.size; i++) {
				code += `regC = pop();\n`;
				code += `set(fp + ${variable.offset + (type.size - i - 1)}, regC); // Variable ${node.name} at ${variable.offset}\n`;
			}
			// code += `regC = pop();\n`;
			// code += `set(fp + ${variable.offset}, regC); // Variable ${node.name} at ${variable.offset}\n`;
		}

		return code;
	}

	private resolveFunctionName(node: ASTReference) {
		if (!node.child) {
			return node.key;
		}

		const variable = this.context.getVariable(node.key);

		let currentRef = node.child;
		let currentType = variable.type;

		const recurse = () => {
			if (currentRef.key) {
				const nextType = (currentType as StructType).fields.find(field => field.name == currentRef.key);
				if (!nextType) throw new Error(`Unknown field: ${currentRef.key}`);
			}

			if (currentRef.child) {
				currentRef = currentRef.child;
				recurse();
			}
		};

		recurse();

		console.log(`Final resolved type`);
		console.log({ currentRef, currentType });

		return "";
	}

	private handleFunctionCall(node: ASTFunctionCall): string {
		const builtIn = builtInFunctions.find(func => func.name == node.reference.key);
		if (builtIn) return builtIn.handleCall(node, this);

		const functionName = this.resolveFunctionName(node.reference);
		const functionInfo = this.functionInfos[functionName];

		let code = "";

		code += `regD = sp; // Setup call ${functionName}\n`; // This will be fp for the method
		if (debug_logs) code += `console.log("Setting up ${functionName}, stack pointer pre args is " + sp);\n`;

		node.arguments.forEach((arg, idx) => {
			code += this.handleNode(arg) + `// ^ Argument ${idx}\n`;
		});

		code += `push(fp);\n`; // Final argument is the frame pointer
		if (debug_logs) code += `console.log("Pushed fp " + fp);\n`;
		code += `fp = regD; // Setup call ${functionName}\n`; // Give the function the fp with args
		code += `${functionName}(); // Call\n`;
		// code += `fp = ref(fp + ${functionInfo.argSize - 1}); // Restore fp\n`; // Restore fp
		code += `fp = pop(); // Restore fp\n`; // Restore fp
		if (debug_logs) code += `console.log("Returned from ${functionName} and restored fp: " + fp);\n`;
		return code;
	}

	private handleReturnStatement(node: ASTReturn, returnType: Type): string {
		let code = "";
		code += this.handleNode(node.expression);

		// Copy return value to frame pointer
		for (let i = 0; i < returnType.size; i++) {
			code += `set(fp + ${i}, ref(sp - ${returnType.size - i})); // Return copy\n`;
		}

		return code;
	}

	public getReferenceOffset(node: ASTReference) {
		const variable = this.context.getVariable(node.key);

		let currentRef = node.child;
		let currentType = variable.type;
		let offset = 0;
		const offsetExprs = [];

		const recurse = () => {
			if (currentRef.key) {
				const nextType = (currentType as StructType).fields.find(field => field.name == currentRef.key);
				if (!nextType) throw new Error(`Unknown field: ${currentRef.key}`);

				currentType = nextType.type;
				offset += nextType.offset;
			}

			if (currentRef.arrayIndex) {
				const typeSize = (currentType as StructType).size;
				const expr = this.handleNode(currentRef.arrayIndex);
				offsetExprs.push(`(${expr} * ${typeSize})`);
			}

			if (currentRef.child) {
				currentRef = currentRef.child;
				recurse();
			}
		};

		if (currentRef) recurse();

		let code = "";
		code += `(${variable.offset} + ${offset}`;
		offsetExprs.forEach(expr => (code += ` + ${expr}`));
		code += `)`;

		return { offset: code, type: currentType };
	}

	private handleBinaryExpression(node: ASTBinaryOperation): string {
		let code = "";
		code += this.handleNode(node.left);
		code += this.handleNode(node.right);
		code += `regB = pop();\n`;
		code += `regA = pop();\n`;
		code += `regC = regA ${node.operator} regB;\n`;
		code += `push(regC);\n`;

		return code;
	}

	private handleFunctionDeclaration(node: ASTFunctionDeclaration): string {
		let code = "";
		this.context = new Context(this.context);

		code += `function ${node.name} () {\n`;

		let argSize = 0;
		node.parameters.forEach((param, idx) => {
			const type = this.resolveType(param.type);
			this.context.addVariable(param.name, type);
			argSize += type.size;
		});
		this.context.addVariable("__previousFp", builtInTypes.int);
		argSize++;

		const returnType = this.resolveType(node.returnType);
		this.functionInfos[node.name] = { argSize, returnType };

		node.body.forEach(bodyNode => {
			if (bodyNode.type == ASTType.Return) {
				code += this.handleReturnStatement(bodyNode, returnType);
			} else {
				code += this.handleNode(bodyNode);
			}
		});

		code += `sp = fp + ${argSize}; // Tear down\n`;

		code += `}\n`;

		this.context = this.context.parent;

		return code;
	}

	private handleIfStatement(node: ASTIfStatement, isElseIf: boolean = false): string {
		let code = "";
		const ifE = isElseIf ? "else if" : "if";
		code += `${ifE}( `;
		code += this.handleNode(node.condition);
		code += `) {\n`;

		node.body.forEach(node => (code += this.handleNode(node)));

		code += `}\n`;

		node.elseIfs.forEach(node => (code += this.handleIfStatement(node, true)));

		if (node.elseBody) {
			code += `else {\n`;
			node.elseBody.forEach(node => (code += this.handleNode(node)));
			code += `}\n`;
		}

		return code;
	}

	private handleNumberLiteral(node: ASTNumber): string {
		return `push(${node.value}); // Num lit ${node.value}\n`;
	}

	private debugReference(node: ASTReference) {
		let currentRef = node;
		let result = "";

		const recurse = () => {
			if (currentRef.key) {
				result += (result.length > 0 ? "." : "") + currentRef.key;
			}

			if (currentRef.arrayIndex) {
				result += `[<expr>]`;
			}

			if (currentRef.child) {
				currentRef = currentRef.child;
				recurse();
			}
		};

		recurse();

		return result;
	}
}

export { Compiler, JSCompiler, Context };
