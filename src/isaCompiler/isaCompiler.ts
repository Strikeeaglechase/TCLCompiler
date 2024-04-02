import {
	AST,
	ASTBinaryOperation,
	ASTDereference,
	ASTEnumStatement,
	ASTForStatement,
	ASTFunctionCall,
	ASTFunctionDeclaration,
	ASTGetAddress,
	ASTIfStatement,
	ASTInlineArrayAssignment,
	ASTInlineStructAssignment,
	ASTNumber,
	ASTPrePostOp,
	ASTProg,
	ASTReference,
	ASTReturn,
	ASTString,
	ASTStructStatement,
	ASTType,
	ASTUnaryOperation,
	ASTVariableAssignment,
	ASTVariableDeclaration,
	ASTWhileStatement,
	TypedKey
} from "../parser/ast.js";
import { Compiler } from "../parser/linker.js";
import { TokenType } from "../parser/tokenizer.js";
import { Visitor } from "../parser/visitor.js";
import { builtInFunctions } from "./builtinFunctions.js";

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
	public currentOffset = 0;

	constructor(private compiler: ISACompiler, private ast: AST[], public parent?: Context) {}

	public setupVariables() {
		const visitor = new Visitor(this.ast);
		visitor.visit(node => this.handleAstNode(node), [ASTType.FunctionDeclaration]);
	}

	private handleAstNode(node: AST) {
		if (node.type == ASTType.StructStatement) return this.compiler.handleStructDeclaration(node, false);
		if (node.type == ASTType.EnumStatement) return this.compiler.handleEnumDeclaration(node);
		if (node.type != ASTType.VariableDeclaration) return;
		const type = this.compiler.resolveType(node.varType);
		this.addVariable(node.name.value, type);
	}

	public getVariable(name: string): Variable {
		if (this.variables[name]) return this.variables[name];
		throw new Error(`Unknown variable: ${name}`);
	}

	public doesVarExist(name: string): boolean {
		return this.variables[name] != undefined;
	}

	public addVariable(name: string, type: Type) {
		this.variables[name] = { name, type, offset: this.currentOffset };
		this.currentOffset += type.size;

		return this.variables[name];
	}

	public advanceOffset(size: number) {
		this.currentOffset += size;
	}
}

const builtInTypes: Type[] = [
	{ name: "int", size: 1, kind: TypeKind.BuiltIn },
	{ name: "void", size: 0, kind: TypeKind.BuiltIn },
	{ name: "char", size: 1, kind: TypeKind.BuiltIn },
	{ name: "bool", size: 1, kind: TypeKind.BuiltIn }
];

const optimize = true;

class ISACompiler implements Compiler {
	public types: Record<string, Type> = {};
	public context: Context;
	private functionInfos: Record<string, { argSize: number; returnType: Type }> = {};
	private currentFunctionInfo: { argSize: number; returnType: Type };

	private stringHeap: Record<string, number> = {};
	private stackSize = 1024;
	private heapInit = this.stackSize + 1;

	private exitLabels: string[] = [];

	private labelId = 0;

	constructor() {
		builtInTypes.forEach(type => this.registerType(type));
	}

	private getSetupCode() {
		let code = "";
		code += `# Setup\n`;
		code += `#define stack_size ${this.stackSize}\n`;
		code += `#define pc R1   # Program counter\n`;
		code += `#define sp R2   # Stack pointer\n`;
		code += `#define fp R3   # Frame pointer\n`;
		code += `#define hp R4   # Heap pointer\n`;
		code += `mov ${this.stackSize + this.heapInit} hp   # Initialize heap pointer\n`;
		code += `#define regA R5   # Math A\n`;
		code += `#define regB R6   # Math B\n`;
		code += `#define regC R6   # Intermittent/General\n`;
		code += `#define regD R7   # Function call setup\n`;
		code += `#define regE R8   # Pointer logic\n`;
		// code += `#define ret readoff R3 0 R1  # Return macro\n`;

		code += `\n`;
		code += `# String init:\n`;
		Object.keys(this.stringHeap).forEach(key => {
			key.split("").forEach((char, idx) => {
				code += `mov ${char.charCodeAt(0)} M${this.stringHeap[key] + idx}  # String[${idx}] char: ${char}\n`;
			});
			code += `mov 0 M${this.stringHeap[key] + key.length}  # Null terminate string\n`;
		});
		code += `\n`;

		return code;
	}

	private getTearDownCode() {
		let code = "";
		code += `halt  # Exit\n`;
		return code;
	}

	private formatFinalOutput(code: string): string {
		let longestLineLength = 0;

		const lines = code.split("\n");
		lines.forEach(line => {
			const lineLength = line.indexOf("#") == -1 ? line.length : line.indexOf("#");
			longestLineLength = Math.max(longestLineLength, lineLength);
		});

		let result = "";
		lines.forEach((line, idx) => {
			if (!line.includes("#")) {
				result += line + "\n";
				return;
			}

			if (line.startsWith("#")) {
				result += line + "\n";
				return;
			}

			const [code, comment] = line.split("#");
			result += code.padEnd(longestLineLength + 3) + "# " + comment.trim() + "\n";
		});

		return result;
	}

	public compile(ast: ASTProg): string {
		// Setup context
		this.context = new Context(this, [ast]);
		this.context.setupVariables();
		let code = "";
		code += `mov ${this.context.currentOffset} sp  # Initialize sp for current context\n`;

		ast.body.forEach(node => (code += this.handleNode(node)));

		const result = this.getSetupCode() + code + this.getTearDownCode();

		return this.formatFinalOutput(result);
	}

	public handleNode(node: AST): string {
		if (node == null) return "";
		let prefix = `# ${node.type}\n`;
		const exec = () => {
			switch (node.type) {
				case ASTType.IfStatement:
					return this.handleIfStatement(node);
				case ASTType.WhileStatement:
					return this.handleWhileStatement(node);
				case ASTType.ForStatement:
					return this.handleForStatement(node);
				case ASTType.FunctionDeclaration:
					return this.handleFunctionDeclaration(node);
				case ASTType.Number:
					return this.handleNumberLiteral(node);
				case ASTType.String:
					return this.handleStringLiteral(node);
				case ASTType.BinaryOperation:
					return this.handleBinaryExpression(node);
				case ASTType.PrePostOp:
					return this.handlePrePostOpExpression(node);
				case ASTType.UnaryOperation:
					return this.handleUnaryExpression(node);
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
					return "";
				default:
					throw new Error(`Unknown node type: ${node.type}`);
			}
		};

		return prefix + exec();
	}

	// References //
	private getVariableReference(node: ASTReference): string {
		// Maybe an enum?
		const enumType = this.types[node.key.value];
		if (enumType && enumType.kind == TypeKind.Enum) {
			// Enum value ref
			const enumValue = enumType.values.find(value => value.name == node.child.key.value);
			if (!enumValue) throw new Error(`Unknown enum key: ${node.child.key.value}`);
			return `push ${enumValue.value}  # Enum ${node.key.value}.${node.child.key.value}\n`;
		}

		let code = "";
		const { code: chainCode, type } = this.getAddressOfVariable(node);
		code += chainCode;

		for (let i = 0; i < type.size; i++) {
			code += `readoff regE ${i} regC  # ${this.debugReference(node)}\n`;
			code += `push regC\n`;
		}

		return code;
	}

	public getAddressOfVariable(node: ASTReference): { code: string; type: Type } {
		const variable = this.context.getVariable(node.key.value);

		const children = this.getChildren(node);

		let type = variable.type;

		let code = "";
		if (node.dereference) {
			// Get what variable is pointing to as base
			code += `readoff fp ${variable.offset} regE  # Deref ${variable.name}\n`;
			type = this.guardType(type, TypeKind.Pointer).baseType;
		} else {
			code += `add fp ${variable.offset} regE  # Set to address of ${variable.name}\n`;
		}

		// Calculate relative offsets
		children.forEach(child => {
			if (child.key) {
				if (child.dereference) {
					const st = this.guardType(this.guardType(type, TypeKind.Pointer).baseType, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key.value);
					code += `readoff regE 0 regE  # Deref parent\n`;
					code += `add regE ${structKey.offset} regE  # Move forward to ${structKey.name}\n`;
					type = structKey.type;
				} else {
					const st = this.guardType(type, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key.value);
					code += `add regE ${structKey.offset} regE  # Move forward to ${structKey.name}\n`;
					type = structKey.type;
				}
			}

			if (child.arrayIndex) {
				code += `push regE  # Protect regE for array index\n`;
				code += this.handleNode(child.arrayIndex);
				// code += `regC = pop();\n`;
				code += `pop regC\n`;
				code += `pop regE\n`;
				code += `readoff regE 0 regE  # Deref parent\n`;
				code += `mul regC ${type.size} regC  # Array index calc\n`;
				code += `add regE regC regE\n`;
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
		code += `push regE  # Get address ${this.debugReference(node.reference)}\n`;

		return code;
	}

	private handleDereference(node: ASTDereference): string {
		let code = "";
		code += this.handleNode(node.expression);
		code += `pop regC\n`;
		code += `readoff regC 0 regC  # Dereference\n`;
		code += `push regC\n`;

		return code;
	}

	private handleVariableAssignment(node: ASTVariableAssignment): string {
		let code = "";
		code += this.handleNode(node.expression);

		const { code: chainCode, type } = this.getAddressOfVariable(node.reference);
		code += chainCode;

		for (let i = 0; i < type.size; i++) {
			code += `pop regC\n`;
			code += `writeoff regC regE ${type.size - i - 1}  # Assign ${this.debugReference(node.reference)}\n`;
		}

		return code;
	}

	private handleVariableDeclaration(node: ASTVariableDeclaration): string {
		let code = "";
		const variable = this.context.getVariable(node.name.value);
		const type = variable.type;

		if (node.arraySizeExpression) {
			// Compute array size
			const tp = this.guardType(type, TypeKind.Pointer);
			code += this.handleNode(node.arraySizeExpression);
			code += `pop regC\n`;
			code += `mul regC ${tp.size} regC\n`;
			code += `writeoff sp fp ${variable.offset}  # Array pointer setup for ${node.name.value}\n`;
			code += `add sp regC sp  # Space for ${node.name}\n`;
		}

		if (node.expression?.type == ASTType.InlineArrayAssignment || node.expression?.type == ASTType.InlineStructAssignment) {
			code += this.handleInlineAssignment(variable, node.expression);
		} else if (node.expression?.type == ASTType.String) {
			code += this.handleStringAssignment(node.expression, variable);
		} else {
			if (node.expression) {
				if (optimize && node.expression.type == ASTType.Number) {
					code += `writeoff ${node.expression.value} fp ${variable.offset}  # Init variable ${node.name.value} at ${variable.offset}\n`;
				} else {
					code += this.handleNode(node.expression);
					for (let i = 0; i < type.size; i++) {
						code += `pop regC\n`;
						code += `writeoff regC fp ${variable.offset + (type.size - i - 1)}  # Init variable ${node.name.value} at ${variable.offset}\n`;
					}
				}
			} else {
				for (let i = 0; i < type.size; i++) {
					code += `writeoff 0 fp ${variable.offset + (type.size - i - 1)}  # Zero init variable ${node.name.value} at ${variable.offset}\n`;
				}
			}
		}

		return code;
	}

	private handleStringAssignment(str: ASTString, variable: Variable): string {
		let code = "";
		const strAddr = this.getStringLiteralAddress(str);
		code += `writeoff ${strAddr} fp ${variable.offset}  # String Array pointer setup for ${variable.name}\n`;
		return code;
	}

	private handleInlineAssignment(variable: Variable, inline: ASTInlineArrayAssignment | ASTInlineStructAssignment): string {
		let code = "";
		if (inline.type == ASTType.InlineArrayAssignment) {
			code += `readoff fp ${variable.offset} regE  # Array pointer for ${variable.name}\n`;
			inline.values.forEach((value, idx) => {
				if (optimize && value.type == ASTType.Number) {
					code += `writeoff ${value.value} regE ${idx * variable.type.size}\n`;
				} else {
					code += `push regE\n`;
					code += this.handleNode(value);
					code += `pop regC\n`;
					code += `pop regE\n`;
					code += `writeoff regC regE ${idx * variable.type.size}\n`;
				}
			});
		} else {
			inline.keys.forEach((key, idx) => {
				const offset = this.resolveStructKeyOffset(key.name.value, this.guardType(variable.type, TypeKind.Struct));
				if (optimize && key.value.type == ASTType.Number) {
					code += `writeoff ${key.value.value} fp ${variable.offset + offset}\n`;
				} else {
					code += this.handleNode(key.value);
					code += `pop regC\n`;
					code += `writeoff regC fp ${variable.offset + offset}\n`;
				}
			});
		}

		return code;
	}

	// Types //
	public handleStructDeclaration(structDecl: ASTStructStatement, doMethods = true): string {
		// console.log(`Setting up struct ${structDecl.name.value}, methods: ${doMethods}`);
		const type: Type = {
			name: structDecl.name.value,
			fields: [],
			size: 0,
			kind: TypeKind.Struct
		};

		let idx = 0;
		structDecl.keys.forEach(field => {
			const fieldSize = this.resolveType(field);
			type.fields.push({ type: fieldSize, name: field.name.value, offset: idx });
			if (field.arrExpr) {
				if (field.arrExpr.type != ASTType.Number) throw new Error(`Expected number for struct array size but got ${field.arrExpr.type}`);
				idx += fieldSize.size * (field.arrExpr as ASTNumber).value;
			} else {
				idx += fieldSize.size;
			}
		});
		type.size = idx;

		this.registerType(type);

		if (!doMethods) return "";

		let code = "\n";
		structDecl.methods.forEach(method => {
			// Rewrite name
			method.name.value = "__" + structDecl.name.value + "_" + method.name.value;
			// Push thisarg as first argument
			const thisParam: TypedKey = {
				name: { value: "this", type: TokenType.Identifier, line: 0, column: 0 },
				isPointer: true,
				type: structDecl.name.value
			};

			method.parameters.unshift(thisParam);

			// Register function
			code += this.handleFunctionDeclaration(method);
		});

		return code;
	}

	public handleEnumDeclaration(enumDecl: ASTEnumStatement): string {
		const enumType: EnumType = {
			name: enumDecl.name.value,
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

	public resolveType(ref: ASTReference | TypedKey) {
		let type: Type;

		if (ref.type == ASTType.Reference) {
			const r = ref as ASTReference;
			type = this.types[r.key.value + (r.dereference ? "*" : "")];
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
		// console.log(`Registering type: ${type.name}`);
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
			return { name: node.key.value, thisargSetup: null };
		}

		const variable = this.context.getVariable(node.key.value);
		const children = this.getChildren(node);
		let type = variable.type;

		let code = "";
		if (node.dereference) {
			// Get what variable is pointing to as base
			code += `readoff fp ${variable.offset} regE  # Deref ${variable.name}\n`;
			type = this.guardType(type, TypeKind.Pointer).baseType;
		} else {
			code += `add fp ${variable.offset} regE  # Set to address of ${variable.name}\n`;
		}

		// Calculate relative offsets
		children.slice(0, -1).forEach(child => {
			if (child.key) {
				if (child.dereference) {
					const st = this.guardType(this.guardType(type, TypeKind.Pointer).baseType, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key.value);
					code += `readoff regE 0 regE  # Deref parent\n`;
					code += `add regE ${structKey.offset} regE  # Move forward to ${structKey.name}\n`;
					type = structKey.type;
				} else {
					const st = this.guardType(type, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key.value);
					code += `add regE ${structKey.offset} regE  # Move forward to ${structKey.name}\n`;
					type = structKey.type;
				}
			}

			if (child.arrayIndex) {
				code += `push regE; // Protect regE for array index\n`;
				code += this.handleNode(child.arrayIndex);
				code += `pop regC\n`;
				code += `pop regE\n`;
				code += `readoff regE 0 regE  # Deref parent\n`;
				code += `mul regC ${type.size} regC  # Array index calc\n`;
				code += `add regE regC regE\n`;
			}
		});

		if (type.kind == TypeKind.Pointer) {
			type = type.baseType;
			code += `readoff regE 0 regE  # Funct final deref\n`;
		}

		code += `push regE  # Push thisarg pointer\n`;
		const name = `__${type.name}_${children.at(-1).key.value}`;

		return { name: name, thisargSetup: code };
	}

	private handleFunctionDeclaration(node: ASTFunctionDeclaration): string {
		let code = "";
		this.context = new Context(this, node.body, this.context);

		const functionGuardLabel = `__function_guard_${node.name.value}`;

		code += `mov ${functionGuardLabel} pc  # Function guard\n`;
		code += `:func_${node.name.value}  # Function ${node.name.value}\n`;

		let argSize = 0;
		const fpParam: TypedKey = {
			name: { value: "__previousFp", type: TokenType.Identifier, line: 0, column: 0 },
			type: "int",
			isPointer: false
		};

		const pcParam: TypedKey = {
			name: { value: "__returnPc", type: TokenType.Identifier, line: 0, column: 0 },
			type: "int",
			isPointer: false
		};

		node.parameters.unshift(pcParam, fpParam);

		node.parameters.forEach((param, idx) => {
			const type = this.resolveType(param);
			this.context.addVariable(param.name.value, type);
			argSize += type.size;
		});

		const returnType = this.resolveType(node.returnType);
		this.functionInfos[node.name.value] = { argSize, returnType };
		this.currentFunctionInfo = { argSize, returnType };

		this.context.setupVariables();
		// code += `mov regD fp  # Setup fp for current context\n`;
		code += `add fp ${this.context.currentOffset} sp  # Initialize sp for current context\n`;

		node.body.forEach(bodyNode => {
			code += this.handleNode(bodyNode);
		});

		code += `add fp ${returnType.size + argSize} sp  # Tear down\n`;
		code += `readoff fp 0 regC  # Return ref\n`;
		code += `add regC 1 pc  # Return jump\n`;

		code += `:${functionGuardLabel}\n`;

		this.context = this.context.parent;

		return code;
	}

	private handleFunctionCall(node: ASTFunctionCall): string {
		const builtIn = builtInFunctions.find(func => func.name == node.reference.key.value);
		if (builtIn) return builtIn.handleCall(node, this);

		const { name: functionName, thisargSetup } = this.resolveFunctionName(node.reference);
		const functionInfo = this.functionInfos[functionName];
		if (!functionInfo) throw new Error(`Unknown function: ${functionName}`);

		let code = "";

		code += `add sp ${functionInfo.returnType.size} sp  # Preallocate return value\n`; // Preallocate return value
		code += `mov sp regD  # Setup call ${functionName}\n`; // This will be fp for the method
		code += `push 0\n`; // First arg, will be overwritten by return address
		code += `push fp\n`; // Second arg, frame pointer

		if (thisargSetup) code += thisargSetup;
		node.arguments.forEach((arg, idx) => {
			code += this.handleNode(arg) + `# ^ Argument ${idx}\n`;
		});

		code += `mov regD fp  # Setup fp for current context\n`;
		code += `call func_${functionName} pc  # Call\n`;

		code += `readoff fp 1 fp  # Restore fp\n`; // Restore fp from arg1
		return code;
	}

	private handleReturnStatement(node: ASTReturn): string {
		let code = "";
		code += this.handleNode(node.expression);

		const retSize = this.currentFunctionInfo.returnType.size;
		const argSize = this.currentFunctionInfo.argSize;

		// Copy return value to frame pointer
		const argProtOffset = 2; // Protect return address and fp

		for (let i = 0; i < retSize; i++) {
			code += `readoff sp ${-retSize + i} regC  # Return copy\n`;
			code += `writeoff regC fp ${-retSize + i}  # Return copy\n`;
		}

		code += `mov fp sp  # Tear down\n`;
		code += `readoff fp 0 regC  # Return ref\n`;
		code += `add regC 1 pc  # Return jump\n`;

		return code;
	}

	// Control flow //
	private handleIfStatement(node: ASTIfStatement, elifIndex = 0): string {
		let code = "";

		code += this.handleNode(node.condition);
		const ifLabel = `if_${this.labelId++}`;
		code += `pop regC\n`;
		code += `movifn ${ifLabel} regC pc\n`;

		node.body.forEach(node => (code += this.handleNode(node)));

		code += `:${ifLabel}\n`;

		// const nextElIf = node.elseIfs[elifIndex];
		// if (nextElIf) {
		// 	// code += `else {\n`;
		// 	const elseLabel = `else_${this.labelId++}`;
		// 	code += `movif ${elseLabel} regC pc\n`;
		// 	code += this.handleIfStatement(nextElIf, elifIndex + 1);

		// 	// code += `}\n`;
		// } else {
		// 	if (node.elseBody) {
		// 		code += `else {\n`;
		// 		node.elseBody.forEach(node => (code += this.handleNode(node)));
		// 		code += `}\n`;
		// 	}
		// }

		return code;
	}

	private handleWhileStatement(node: ASTWhileStatement): string {
		let code = "";

		// code += `while (true) {\n`;
		const whileLoopLabel = `while_${this.labelId++}`;
		const whileEndLabel = `while_end_${this.labelId++}`;

		code += `:${whileLoopLabel}\n`;
		code += this.handleNode(node.condition);
		code += `pop regC\n`;
		code += `movifn ${whileEndLabel} regC pc\n`;

		this.exitLabels.push(whileEndLabel);
		node.body.forEach(node => (code += this.handleNode(node)));
		this.exitLabels.pop();

		code += `mov ${whileLoopLabel} pc\n`;
		code += `:${whileEndLabel}\n`;

		return code;
	}

	private handleForStatement(node: ASTForStatement): string {
		let code = "";

		if (node.initialization) code += this.handleNode(node.initialization);
		const forLoopLabel = `for_${this.labelId++}`;
		const forEndLabel = `for_end_${this.labelId++}`;

		code += `:${forLoopLabel}\n`;
		if (node.condition) {
			code += this.handleNode(node.condition);
			code += `pop regC\n`;
			code += `movifn ${forEndLabel} regC pc\n`;
		}

		this.exitLabels.push(forEndLabel);
		node.body.forEach(node => (code += this.handleNode(node)));
		if (node.iteration) code += this.handleNode(node.iteration);
		this.exitLabels.pop();

		code += `mov ${forLoopLabel} pc\n`;
		code += `:${forEndLabel}\n`;

		return code;
	}

	// Math //
	private handleBinaryExpression(node: ASTBinaryOperation): string {
		const opInstructionMap = {
			"+": "add",
			"-": "sub",
			"*": "mul",
			"/": "div",
			"%": "mod",
			"&": "and",
			"|": "or",
			"^": "xor",
			"<<": "shl",
			">>": "shr",
			"&&": "and",
			"||": "or",
			"==": "cmpeq",
			"!=": "cmpne",
			"<": "cmplt",
			"<=": "cmple"
		};

		let code = "";
		const optLhs = optimize && node.left.type == ASTType.Number;
		const optRhs = optimize && node.right.type == ASTType.Number;
		if (!optLhs) code += this.handleNode(node.left);
		if (!optRhs) code += this.handleNode(node.right);
		if (!optRhs) code += `pop regB\n`;
		if (!optLhs) code += `pop regA\n`;

		let lhs = optLhs ? (node.left as ASTNumber).value : "regA";
		let rhs = optRhs ? (node.right as ASTNumber).value : "regB";
		let operator = node.operator.value;

		if (operator == ">" || operator == ">=") {
			const swap = lhs;
			lhs = rhs;
			rhs = swap;
			operator = operator.replace(">", "<");
		}

		const op = opInstructionMap[operator];
		if (!op) throw new Error(`Unknown operator: ${operator}`);
		code += `${op} ${lhs} ${rhs} regC\n`;
		code += `push regC\n`;

		return code;
	}

	private handlePrePostOpExpression(node: ASTPrePostOp): string {
		let code = "";

		if (node.ret && node.returnBefore) code += this.handleNode(node.ret);
		code += this.handleNode(node.do);
		if (node.ret && !node.returnBefore) code += this.handleNode(node.ret);

		return code;
	}

	private handleUnaryExpression(node: ASTUnaryOperation): string {
		let code = "";
		code += this.handleNode(node.expression);
		code += `pop regA\n`;
		switch (node.operator) {
			case "++":
				code += `add regA 1 regC\n`;
				break;
			case "--":
				code += `sub regA 1 regC\n`;
				break;
			case "~":
				code += `not regA regC\n`;
				break;
			case "!":
				code += `cmpeq regA 0 regC\n`;
				break;
			case "-":
				code += `not regA regC\nadd regC 1 regC\n`;
				break;
			default:
				throw new Error(`Unknown unary operator: ${node.operator}`);
		}

		code += `push regC\n`;

		return code;
	}

	private handleNumberLiteral(node: ASTNumber): string {
		return `push ${node.value}  # Num lit ${node.value}\n`;
	}

	private getStringLiteralAddress(node: ASTString): number {
		const stringKey = this.stringHeap[node.value];
		if (stringKey) {
			return stringKey;
		}

		const key = this.heapInit;
		this.heapInit += node.value.length + 1;
		this.stringHeap[node.value] = key;

		return key;
	}

	private handleStringLiteral(node: ASTString): string {
		const key = this.getStringLiteralAddress(node);
		return `push ${key}  # String literal ${node.value} at ${key}\n`;
	}
}

export { ISACompiler, Context };
