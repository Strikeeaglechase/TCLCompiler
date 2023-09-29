import {
	AST,
	ASTBinaryOperation,
	ASTDereference,
	ASTEnumStatement,
	ASTFunctionCall,
	ASTFunctionDeclaration,
	ASTGetAddress,
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
	ASTVariableDeclaration,
	TypedKey
} from "../parser/ast.js";
import { builtInFunctions } from "./builtInFunctions.js";

interface Compiler {
	compile(ast: ASTProg): string;
}

enum TypeKind {
	Struct,
	BuiltIn,
	Pointer,
	Enum
}

interface StructType {
	kind: TypeKind.Struct;
	name: string;
	fields: { type: Type; name: string; offset: number }[];
	size: number;
}

interface BuiltInType {
	kind: TypeKind.BuiltIn;
	name: string;
	size: number;
}

interface PointerType {
	kind: TypeKind.Pointer;
	baseType: Type;
	size: 1;
	name: string;
}

interface EnumType {
	kind: TypeKind.Enum;
	name: string;
	values: { name: string; value: number }[];
	size: 1;
}

type Type = StructType | BuiltInType | PointerType | EnumType;

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
		// if (this.parent) {
		// 	const variable = this.parent.getVariable(name);
		// 	if(variable)
		// }

		throw new Error(`Unknown variable: ${name}`);
	}

	public addVariable(name: string, type: Type) {
		this.variables[name] = { name, type, offset: this.currentOffset };
		this.currentOffset += type.size;

		return this.variables[name];
	}
}

const builtInTypes: Type[] = [
	{ name: "int", size: 1, kind: TypeKind.BuiltIn },
	{ name: "void", size: 0, kind: TypeKind.BuiltIn }
];

const debug_logs = false;

class JSCompiler implements Compiler {
	public types: Record<string, Type> = {};
	public context: Context = new Context();
	private functionInfos: Record<string, { argSize: number; returnType: Type }> = {};
	private currentFunctionReturnType: Type;

	private semiIndex = 0;
	constructor(private semiTerminatedLines: string[] = []) {
		builtInTypes.forEach(type => this.registerType(type));
	}

	private getSetupCode() {
		let code = "";
		code += `// Setup\n`;
		code += `const stack_size = 1024;\n`;
		code += `let fp = 0; // Frame pointer\n`;
		code += `let sp = fp; // Stack pointer\n`;
		code += `const stack = [];\n`;
		code += `const push = (value) => stack[sp++] = value;\n`;
		code += `const pop = () => stack[--sp];\n`;
		code += `const ref = (idx) => stack[idx];\n`;
		code += `const set = (idx, value) => stack[idx] = value;\n`;
		code += `let hp = stack_size; // Heap pointer\n`;
		code += `const malloc = (size) => { const result = hp; hp += size; return result; };\n`;
		code += `let regA = 0; // Math A\n`;
		code += `let regB = 0; // Math B\n`;
		code += `let regC = 0; // Intermittent/General\n`;
		code += `let regD = 0; // Function call setup\n`;
		code += `let regE = 0; // Pointer logic\n`;
		code += `const argReg = [];\n`;

		code += `\n`;

		return code;
	}

	private getTearDownCode() {
		let code = "";
		// code += `console.log({ stack, sp, fp, regA, regB, regC });\n`;

		return code;
	}

	public compile(ast: ASTProg): string {
		let code = "";

		code += this.getSetupCode();
		code += "// " + this.semiTerminatedLines[this.semiIndex++] + "\n";
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
				case ASTType.Return:
					return this.handleReturnStatement(node);
				case ASTType.FunctionCall:
					return this.handleFunctionCall(node);
				case ASTType.VariableDeclaration:
					return this.handleVariableDeclaration(node);
				case ASTType.StructStatement:
					return this.handleStructDeclaration(node);
				case ASTType.EnumStatement:
					return this.handleEnumDeclaration(node);
				case ASTType.VariableAssignment:
					return this.handleVariableAssignment(node);
				case ASTType.GetAddress:
					return this.handleGetAddress(node);
				case ASTType.Dereference:
					return this.handleDereference(node);
				case ASTType.Semi:
					return "// " + this.semiTerminatedLines[this.semiIndex++] + "\n";
				default:
					throw new Error(`Unknown node type: ${node.type}`);
			}
		};

		return prefix + exec();
	}

	// References //

	private getVariableReference(node: ASTReference): string {
		// Maybe an enum?
		const enumType = this.types[node.key];
		if (enumType && enumType.kind == TypeKind.Enum) {
			// Enum value ref
			const enumValue = enumType.values.find(value => value.name == node.child.key);
			if (!enumValue) throw new Error(`Unknown enum key: ${node.child.key}`);
			return `push(${enumValue.value}); // Enum ${node.key}.${node.child.key}\n`;
		}

		let code = "";
		const { code: chainCode, type } = this.getAddressOfVariable(node);
		code += chainCode;

		for (let i = 0; i < type.size; i++) {
			code += `regC = ref(regE + ${i}); // ${this.debugReference(node)}\n`;
			code += `push(regC);\n`;
		}

		if (debug_logs) code += `console.log("ref ${this.debugReference(node)}: " + regC);\n`;
		return code;
	}

	public getAddressOfVariable(node: ASTReference): { code: string; type: Type } {
		const variable = this.context.getVariable(node.key);

		const children = this.getChildren(node);

		let type = variable.type;

		let code = "";
		if (node.dereference) {
			// Get what variable is pointing to as base
			code += `regE = ref(fp + ${variable.offset}); // Deref ${variable.name}\n`;
			type = this.guardType(type, TypeKind.Pointer).baseType;
		} else {
			code += `regE = fp + ${variable.offset}; // Set to address of ${variable.name}\n`;
		}

		// Calculate relative offsets
		children.forEach(child => {
			if (child.key) {
				if (child.dereference) {
					const st = this.guardType(this.guardType(type, TypeKind.Pointer).baseType, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key);
					// code += `regC =  // Deref parent for ${structKey.name}\n`;
					code += `regE = ref(regE) + ${structKey.offset}; // Deref parent and move forward to ${structKey.name}\n`;
					type = structKey.type;
				} else {
					const st = this.guardType(type, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key);
					code += `regE = regE + ${structKey.offset}; // Move forward to ${structKey.name}\n`;
					type = structKey.type;
				}
			}

			if (child.arrayIndex) {
				code += `push(regE); // Protect regE for array index\n`;
				code += this.handleNode(child.arrayIndex);
				code += `regC = pop();\n`;
				code += `regE = pop();\n`;
				code += `regE = ref(regE)\n`;
				code += `regE = regE + (regC * ${type.size}); // Move forward to array index\n`;
			}
		});

		return { code: code, type: type };
	}

	private getChildren(node: ASTReference): ASTReference[] {
		const children: ASTReference[] = [];
		const getChildren = (ref: ASTReference) => {
			if (ref.child) {
				children.push(ref.child);
				getChildren(ref.child);
			}
		};
		getChildren(node);
		return children;
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

	// Variables //

	private handleGetAddress(node: ASTGetAddress): string {
		let code = "";
		const { code: chainCode, type } = this.getAddressOfVariable(node.reference);
		code += chainCode;
		code += `push(regE); // Get address ${this.debugReference(node.reference)}\n`;

		return code;
	}

	private handleDereference(node: ASTDereference): string {
		let code = "";
		code += this.handleNode(node.reference);
		code += `regC = pop();\n`;
		code += `push(ref(regC)); // Dereference ${this.debugReference(node.reference)}\n`;

		return code;
	}

	private handleVariableAssignment(node: ASTVariableAssignment): string {
		// const { offset, type, isPointer } = this.getReferenceChain(node.reference);

		// const chain = this.getReferenceChain(node.reference);
		// const type = chain[chain.length - 1].type;

		let code = "";
		code += this.handleNode(node.expression);

		const { code: chainCode, type } = this.getAddressOfVariable(node.reference);
		code += chainCode;

		for (let i = 0; i < type.size; i++) {
			code += `regC = pop();\n`;
			code += `set(fp + regE + ${type.size - i - 1}, regC); // Assign ${this.debugReference(node.reference)}\n`;
		}

		return code;
	}

	private handleVariableDeclaration(node: ASTVariableDeclaration): string {
		let code = "";
		const type = this.resolveType(node.varType);
		const variable = this.context.addVariable(node.name, type);

		if (node.arraySizeExpression) {
			// Compute array size
			const tp = this.guardType(type, TypeKind.Pointer);
			code += this.handleNode(node.arraySizeExpression);
			code += `regC = pop();\n`;
			code += `regC = regC * ${tp.size};\n`;
			code += `set(fp + ${variable.offset}, fp + ${variable.offset} + 1); // Array pointer into heap for ${node.name}\n`;
			code += `sp += regC + 1; // Space for ${node.name}\n`;
		} else {
			code += `sp += ${variable.type.size}; // Space for ${node.name}\n`;
		}

		if (node.expression.type == ASTType.InlineArrayAssignment || node.expression.type == ASTType.InlineStructAssignment) {
			code += this.handleInlineAssignment(variable, node.expression);
		} else {
			code += this.handleNode(node.expression);
			for (let i = 0; i < type.size; i++) {
				code += `regC = pop();\n`;
				code += `set(fp + ${variable.offset + (type.size - i - 1)}, regC); // Variable ${node.name} at ${variable.offset}\n`;
			}
		}

		return code;
	}

	private handleInlineAssignment(variable: Variable, inline: ASTInlineArrayAssignment | ASTInlineStructAssignment): string {
		let code = "";
		if (inline.type == ASTType.InlineArrayAssignment) {
			code += `regE = ref(fp + ${variable.offset}); // Array pointer into heap for ${variable.name}\n`;
			inline.values.forEach((value, idx) => {
				code += `push(regE);\n`;
				code += this.handleNode(value);
				code += `regC = pop();\n`;
				code += `regE = pop();\n`;
				code += `set(regE + ${variable.offset + idx * variable.type.size}, regC);\n`;
			});
		} else {
			inline.keys.forEach((key, idx) => {
				code += this.handleNode(key.value);
				const offset = this.resolveStructKeyOffset(key.name, this.guardType(variable.type, TypeKind.Struct));
				code += `regC = pop();\n`;
				code += `set(fp + ${variable.offset + offset}, regC);\n`;
			});
		}

		return code;
	}

	// Types //

	private handleStructDeclaration(structDecl: ASTStructStatement): string {
		const type: Type = {
			name: structDecl.name,
			fields: [],
			size: 0,
			kind: TypeKind.Struct
		};

		let idx = 0;
		structDecl.keys.forEach(field => {
			const fieldSize = this.resolveType(field);
			type.fields.push({ type: fieldSize, name: field.name, offset: idx });
			if (field.arrExpr) {
				if (field.arrExpr.type != ASTType.Number) throw new Error(`Expected number for struct array size but got ${field.arrExpr.type}`);
				idx += fieldSize.size * (field.arrExpr as ASTNumber).value;
			} else {
				idx += fieldSize.size;
			}
		});
		type.size = idx;

		this.registerType(type);

		let code = "\n";
		structDecl.methods.forEach(method => {
			// Rewrite name
			method.name = "__" + structDecl.name + "_" + method.name;
			// Push thisarg as first argument
			method.parameters.unshift({
				name: "this",
				isPointer: true,
				type: structDecl.name
			});

			// Register function
			code += this.handleFunctionDeclaration(method);
		});

		return code;
	}

	private handleEnumDeclaration(enumDecl: ASTEnumStatement): string {
		const enumType: EnumType = {
			name: enumDecl.name,
			kind: TypeKind.Enum,
			values: [],
			size: 1
		};

		enumDecl.values.forEach(value => {
			enumType.values.push({ name: value.name, value: value.value });
		});

		this.registerType(enumType);

		return "\n";
	}

	private resolveType(ref: ASTReference | TypedKey) {
		let type: Type;

		if (ref.type == ASTType.Reference) {
			const r = ref as ASTReference;
			type = this.types[r.key + (r.dereference ? "*" : "")];
		} else {
			const r = ref as TypedKey;
			type = this.types[r.type + (r.isPointer ? "*" : "")];
		}

		if (!type) throw new Error(`Unknown type: ${JSON.stringify(ref)}`);

		return type;
	}

	private resolveStructKeyOffset(tag: string, structType: StructType) {
		const parts = tag.split(".");
		let currentType: Type = structType;
		let offset = 0;
		parts.forEach(part => {
			const st = this.guardType(currentType, TypeKind.Struct);
			const field = st.fields.find(field => field.name == part);
			if (!field) throw new Error(`Unknown field: ${part}`);
			offset += field.offset;
			currentType = field.type;
		});

		return offset;
	}

	private registerType(type: Type) {
		this.types[type.name] = type;
		// Create pointer type
		const pointerType: PointerType = {
			name: type.name + "*",
			baseType: type,
			kind: TypeKind.Pointer,
			size: 1
		};

		this.types[pointerType.name] = pointerType;
		return { type, pointerType };
	}

	private guardType(type: Type, req: TypeKind.BuiltIn): BuiltInType;
	private guardType(type: Type, req: TypeKind.Struct): StructType;
	private guardType(type: Type, req: TypeKind.Pointer): PointerType;
	private guardType(type: Type, req: TypeKind): Type {
		if (type.kind != req) throw new Error(`Expected type ${TypeKind[req]} but got ${TypeKind[type.kind]}`);
		return type;
	}

	// Functions //

	private resolveFunctionName(node: ASTReference) {
		if (!node.child) {
			return { name: node.key, thisargSetup: null };
		}

		const variable = this.context.getVariable(node.key);
		const children = this.getChildren(node);
		let type = variable.type;

		let code = "";
		if (node.dereference) {
			// Get what variable is pointing to as base
			code += `regE = ref(fp + ${variable.offset}); // Deref ${variable.name}\n`;
			type = this.guardType(type, TypeKind.Pointer).baseType;
		} else {
			code += `regE = fp + ${variable.offset}; // Set to address of ${variable.name}\n`;
		}

		// Calculate relative offsets
		children.slice(0, -1).forEach(child => {
			if (child.key) {
				if (child.dereference) {
					const st = this.guardType(this.guardType(type, TypeKind.Pointer).baseType, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key);
					// code += `regC =  // Deref parent for ${structKey.name}\n`;
					code += `regE = ref(regE) + ${structKey.offset}; // Deref parent and move forward to ${structKey.name}\n`;
					type = structKey.type;
				} else {
					const st = this.guardType(type, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key);
					code += `regE = regE + ${structKey.offset}; // Move forward to ${structKey.name}\n`;
					type = structKey.type;
				}
			}

			if (child.arrayIndex) {
				code += `push(regE); // Protect regE for array index\n`;
				code += this.handleNode(child.arrayIndex);
				code += `regC = pop();\n`;
				code += `regE = pop();\n`;
				code += `regE = ref(regE)\n`;
				code += `regE = regE + (regC * ${type.size}); // Move forward to array index\n`;
			}
		});

		if (type.kind == TypeKind.Pointer) {
			type = type.baseType;
			code += `regE = ref(regE); // Funct final deref\n`;
		}

		code += `push(regE); // Push thisarg pointer`;
		const name = `__${type.name}_${children.at(-1).key}`;

		return { name: name, thisargSetup: code };
	}

	private handleFunctionDeclaration(node: ASTFunctionDeclaration): string {
		let code = "";
		this.context = new Context(this.context);

		code += `function ${node.name} () {\n`;

		let argSize = 0;
		node.parameters.forEach((param, idx) => {
			const type = this.resolveType(param);
			this.context.addVariable(param.name, type);
			argSize += type.size;
		});
		this.context.addVariable("__previousFp", this.types["int"]);
		argSize++;

		const returnType = this.resolveType(node.returnType);
		this.functionInfos[node.name] = { argSize, returnType };
		this.currentFunctionReturnType = returnType;

		node.body.forEach(bodyNode => {
			code += this.handleNode(bodyNode);
		});

		code += `sp = fp + ${returnType.size + 1}; // Tear down\n`;

		code += `}\n`;

		this.context = this.context.parent;

		return code;
	}

	private handleFunctionCall(node: ASTFunctionCall): string {
		const builtIn = builtInFunctions.find(func => func.name == node.reference.key);
		if (builtIn) return builtIn.handleCall(node, this);

		const { name: functionName, thisargSetup } = this.resolveFunctionName(node.reference);

		let code = "";

		code += `regD = sp; // Setup call ${functionName}\n`; // This will be fp for the method
		if (debug_logs) code += `console.log("Setting up ${functionName}, stack pointer pre args is " + sp);\n`;

		if (thisargSetup) code += thisargSetup;
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

	private handleReturnStatement(node: ASTReturn): string {
		let code = "";
		code += this.handleNode(node.expression);

		// Copy return value to frame pointer
		for (let i = 0; i < this.currentFunctionReturnType.size; i++) {
			code += `set(fp + ${i}, ref(sp - ${this.currentFunctionReturnType.size - i})); // Return copy\n`;
		}

		code += `sp = fp + ${this.currentFunctionReturnType.size + 1}; // Tear down\n`;
		code += `return;\n`;

		return code;
	}

	private handleIfStatement(node: ASTIfStatement, elifIndex = 0): string {
		let code = "";

		code += this.handleNode(node.condition);
		const ifE = elifIndex > 0 ? "else if" : "if";
		code += `${ifE}(pop()) {\n `;

		node.body.forEach(node => (code += this.handleNode(node)));

		code += `}\n`;

		const nextElIf = node.elseIfs[elifIndex];
		if (nextElIf) {
			code += `else {\n`;
			code += this.handleIfStatement(nextElIf, elifIndex + 1);
			code += `}\n`;
		} else {
			if (node.elseBody) {
				code += `else {\n`;
				node.elseBody.forEach(node => (code += this.handleNode(node)));
				code += `}\n`;
			}
		}

		return code;
	}

	// Math //
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

	private handleNumberLiteral(node: ASTNumber): string {
		return `push(${node.value}); // Num lit ${node.value}\n`;
	}
}

export { Compiler, JSCompiler, Context };
