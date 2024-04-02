import { builtInFunctions } from "./isaCompiler/builtinFunctions.js";
import { AST, ASTEnumStatement, ASTFunctionDeclaration, ASTNumber, ASTProg, ASTReference, ASTStructStatement, ASTType, TypedKey } from "./parser/ast.js";
import { Token } from "./parser/tokenizer.js";
import { Visitor } from "./parser/visitor.js";

enum ReferenceType {
	Type = "Type",
	Variable = "Variable",
	Function = "Function"
}

interface ReferenceInfo {
	ref: ASTReference;
	type: ReferenceType;
	members?: { name: Token; type: Type }[];
	dataType: Type;
	knownValue?: number;
}

interface AnalyzerError {
	message: string;
	node: AST;

	lineStart: number;
	columnStart: number;
	lineEnd: number;
	columnEnd: number;
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
}

class Context {
	public variables: Record<string, Variable> = {};
	public functions: Record<string, ASTFunctionDeclaration> = {};

	constructor(private analyzer: ASTAnalyzer, private ast: AST[], public parent?: Context) {}

	public setupVariables() {
		const visitor = new Visitor(this.ast);
		visitor.visit(node => this.handleAstNode(node), [ASTType.FunctionDeclaration]);
	}

	private handleAstNode(node: AST) {
		if (node.type == ASTType.StructStatement) return this.analyzer.handleStructDeclaration(node, false);
		if (node.type == ASTType.EnumStatement) return this.analyzer.handleEnumDeclaration(node);
		if (node.type != ASTType.VariableDeclaration) return;
		const type = this.analyzer.resolveType(node.varType);
		this.addVariable(node.name.value, type);
	}

	public addVariable(name: string, type: Type) {
		this.variables[name] = { name, type };

		return this.variables[name];
	}

	public getVariable(name: string): Variable {
		if (this.variables[name]) return this.variables[name];
		throw new Error(`Unknown variable: ${name}`);
	}

	public addFunction(name: string, func: ASTFunctionDeclaration, struct?: string) {
		if (struct) name = struct + "." + name;
		this.functions[name] = func;
	}

	public getFunction(name: string, struct?: string): ASTFunctionDeclaration {
		if (struct) name = struct.replaceAll("*", "") + "." + name;
		if (this.functions[name]) return this.functions[name];
		if (this.parent && this.parent.functions[name]) return this.parent.functions[name];
		throw new Error(`Unknown function: ${name}`);
	}
}

const builtInTypes: Type[] = [
	{ name: "int", size: 1, kind: TypeKind.BuiltIn },
	{ name: "void", size: 0, kind: TypeKind.BuiltIn },
	{ name: "char", size: 1, kind: TypeKind.BuiltIn },
	{ name: "bool", size: 1, kind: TypeKind.BuiltIn }
];

class ASTAnalyzer {
	public types: Record<string, Type> = {};
	private context: Context;

	private referenceInfos: ReferenceInfo[] = [];
	public errors: AnalyzerError[] = [];

	constructor() {
		builtInTypes.forEach(type => this.registerType(type));
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

	private isType(ref: ASTReference | TypedKey) {
		try {
			this.resolveType(ref);
			return true;
		} catch (e) {
			return false;
		}
	}

	public load(ast: ASTProg) {
		this.context = new Context(this, ast.body);
		this.context.setupVariables();

		ast.body.forEach(node => this.handleNode(node, null));
	}

	public getReferenceInfo(ref: ASTReference) {
		return this.referenceInfos.find(info => info.ref == ref);
	}

	private handleNode(node: AST, parent: AST) {
		if (node == null) return;
		try {
			switch (node.type) {
				case ASTType.FunctionDeclaration:
					return this.handleFunctionDeclaration(node);
				case ASTType.StructStatement:
					return this.handleStructDeclaration(node, true);
				case ASTType.EnumStatement:
					return this.handleEnumDeclaration(node);
				case ASTType.Reference:
					return this.handleReference(node, parent);
				default:
					return this.walkUnknownNode(node);
			}
		} catch (e) {
			console.log(`Error parsing AST node: ${ASTType[node.type]}. ${e.message} at ${node.line}:${node.column}`);
			console.log(e.stack);
			this.errors.push({
				message: e.message,
				node,
				lineStart: node.line,
				columnStart: node.column,
				lineEnd: node.lineEnd ?? node.line,
				columnEnd: node.columnEnd ?? node.column
			});
		}
	}

	private walkUnknownNode(node: AST) {
		for (const key in node) {
			const value = node[key];
			this.maybeVisitUnknown(value, node);
		}
	}

	private maybeVisitUnknown(node: any, parent: AST) {
		if (typeof node != "object" || !node) return;
		if (Array.isArray(node)) {
			node.forEach(k => this.maybeVisitUnknown(k, parent));
			return;
		}

		if (!("type" in node)) return;

		const t = node.type as ASTType;
		const typeStr = ASTType[t];
		if (!typeStr) return;

		this.handleNode(node, parent);
	}

	private handleReference(ref: ASTReference, parent: AST) {
		const isVariable = ref.key.value in this.context.variables;
		const isFunction = ref.key.value in this.context.functions;
		const isType = this.isType(ref);
		// const builtIn = builtInFunctions.find(func => func.name == node.reference.key.value);
		const isBuiltinFunction = builtInFunctions.some(func => func.name == ref.key.value);
		const bfs = builtInFunctions.map(func => func.name);
		if (!isVariable && !isFunction && !isType && !isBuiltinFunction) throw new Error(`Unknown reference: ${ref.key.value}`);

		if (isBuiltinFunction) {
			const func = builtInFunctions.find(func => func.name == ref.key.value);
			const retType = this.types[func.returnType];
			const members: { name: Token; type: Type }[] = func.argumentTypes.map(param => {
				return { name: param.name, type: this.types[param.type] };
			});
			this.referenceInfos.push({ ref, type: ReferenceType.Function, members, dataType: retType });
			return;
		}

		if (isFunction) {
			const func = this.context.getFunction(ref.key.value);
			const retType = this.resolveType(func.returnType);
			const members = func.parameters.map(param => ({ name: param.name, type: this.resolveType(param) }));
			this.referenceInfos.push({ ref, type: ReferenceType.Function, members, dataType: retType });
			return;
		}

		let type: Type;
		if (isType) {
			type = this.resolveType(ref);
			this.referenceInfos.push({ ref, type: ReferenceType.Type, dataType: type });
			// Enum value
			if (ref.child) {
				const enumType = this.guardType(type, TypeKind.Enum);
				const enumValue = enumType.values.find(value => value.name == ref.child.key.value);
				type = { name: "int", size: 1, kind: TypeKind.BuiltIn };
				this.referenceInfos.push({ ref: ref.child, type: ReferenceType.Variable, dataType: type, knownValue: enumValue.value });
			}

			return;
		}

		if (!isVariable) {
			console.log(`Drop through ref: ${ref.key}`);
			console.log(ref);
		}

		if (isVariable) {
			const variable = this.context.getVariable(ref.key.value);
			type = variable.type;
			if (ref.dereference) {
				type = this.guardType(type, TypeKind.Pointer).baseType;
			}

			this.referenceInfos.push({ ref, type: ReferenceType.Variable, dataType: type });
		}

		const children = this.getChildren(ref);
		children.forEach((child, idx) => {
			// parent.arguments.includes(ref) check is required to ensure an argument to the function isn't treated like a struct-method call
			if (parent && parent.type == ASTType.FunctionCall && idx == children.length - 1 && !parent.arguments.includes(ref)) {
				// Final child of ref chain is method call
				const func = this.context.getFunction(child.key.value, type.name);
				const retType = this.resolveType(func.returnType);
				const members = func.parameters.map(param => ({ name: param.name, type: this.resolveType(param) }));
				this.referenceInfos.push({ ref: child, type: ReferenceType.Function, members, dataType: retType });
				return;
			}
			if (child.key) {
				if (child.dereference) {
					const st = this.guardType(this.guardType(type, TypeKind.Pointer).baseType, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key.value);
					type = structKey.type;
					this.referenceInfos.push({ ref: child, type: ReferenceType.Variable, dataType: type });
				} else {
					const st = this.guardType(type, TypeKind.Struct);
					const structKey = st.fields.find(field => field.name == child.key.value);
					type = structKey.type;
					this.referenceInfos.push({ ref: child, type: ReferenceType.Variable, dataType: type });
				}
			}
		});
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

	private guardType(type: Type, req: TypeKind.BuiltIn): BuiltInType;
	private guardType(type: Type, req: TypeKind.Struct): StructType;
	private guardType(type: Type, req: TypeKind.Pointer): PointerType;
	private guardType(type: Type, req: TypeKind.Enum): EnumType;
	private guardType(type: Type, req: TypeKind): Type {
		if (type.kind != req) throw new Error(`Expected type ${TypeKind[req]} but got ${TypeKind[type.kind]}`);
		return type;
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

		return;
	}

	public handleStructDeclaration(structDecl: ASTStructStatement, doMethods = true): string {
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

		if (!doMethods) return;

		let code = "\n";
		structDecl.methods.forEach(method => {
			// Rewrite name
			// method.name.value = structDecl.name.value + "." + method.name.value;

			// Register function
			code += this.handleFunctionDeclaration(method, structDecl.name.value);
		});

		return code;
	}

	private handleFunctionDeclaration(funcDecl: ASTFunctionDeclaration, tiedStruct?: string) {
		// console.log(`Registering function ${funcDecl.name.value}`);
		this.context.addFunction(funcDecl.name.value, funcDecl, tiedStruct);

		this.context = new Context(this, funcDecl.body, this.context);

		funcDecl.parameters.forEach((param, idx) => {
			const type = this.resolveType(param);
			this.context.addVariable(param.name.value, type);
		});

		if (tiedStruct) {
			// Setup thisarg
			const thisType = this.types[tiedStruct + "*"];
			this.context.addVariable("this", thisType);
			// console.log(`Resgistered this for ${tiedStruct} as ${thisType.kind}, ${thisType.name}, ${thisType.size}`);
		}

		this.context.setupVariables();

		funcDecl.body.forEach(node => this.handleNode(node, funcDecl));

		this.context = this.context.parent;
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
}

export { ASTAnalyzer, AnalyzerError, ReferenceInfo, ReferenceType, Type, TypeKind };
