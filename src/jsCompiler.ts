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
} from "./parser/ast.js";

interface Compiler {
	compile(ast: ASTProg): string;
}

interface StructType {
	name: string;
	fields: { type: Type; name: string; offset: number }[];
	size: number;
}

type Type = StructType | "int";
interface Variable {
	name: string;
	type: Type;
}

class Context {
	public variables: Record<string, Variable> = {};

	constructor(public parent: Context | null = null) {}

	public getVariable(name: string): Variable {
		if (this.variables[name]) return this.variables[name];
		if (this.parent) return this.parent.getVariable(name);

		throw new Error(`Unknown variable: ${name}`);
	}

	public addVariable(name: string, type: Type) {
		this.variables[name] = { name, type };
	}
}
let uidCounter = 0;

class JSCompiler implements Compiler {
	// private code: string = "";
	private types: Record<string, Type> = { int: "int" };
	private context: Context = new Context();

	public compile(ast: ASTProg): string {
		let code = "";
		ast.body.forEach(node => (code += this.handleNode(node)));

		return code;
	}

	private handleNode(node: AST): string {
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
				return this.handleReference(node);
			case ASTType.Return:
				return this.handleReturnStatement(node);
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
	}

	private handleVariableAssignment(node: ASTVariableAssignment): string {
		let code = "";
		code += this.handleReference(node.reference);
		code += ` = `;
		code += this.handleNode(node.expression);
		code += `;\n`;

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
			if (field.type == "int") {
				type.fields.push({ type: "int", name: field.name, offset: idx });
				idx += 1;
			} else {
				const structType = this.types[field.type] as StructType;
				if (!structType) throw new Error(`Unknown struct type: ${field.type}`);

				type.fields.push({ type: structType, name: field.name, offset: idx });
				idx += structType.size;
			}
		});

		type.size = idx;

		this.types[type.name] = type;

		return "";
	}

	private handleVariableDeclaration(node: ASTVariableDeclaration): string {
		let code = "";
		if (node.varType.key == "int") {
			code += `let ${node.name} = `;
			code += this.handleNode(node.expression);
			code += `;\n`;
			this.context.addVariable(node.name, "int");
		} else {
			// Array or struct arr
			code += `let ${node.name} = [];\n`;
			const expr = node.expression as ASTInlineStructAssignment | ASTInlineArrayAssignment;
			if (expr.type == ASTType.InlineArrayAssignment) {
				expr.values.forEach((value, idx) => {
					code += `${node.name}[${idx}] = `;
					code += this.handleNode(value);
					code += `;\n`;
				});

				const type = this.types[node.varType.key];
				if (!type) throw new Error(`Unknown type: ${node.varType.key}`);
				this.context.addVariable(node.name, type);
			} else {
				const structType = this.types[node.varType.key] as StructType;
				if (!structType) throw new Error(`Unknown struct type: ${node.varType.key}`);

				expr.keys.forEach((key, idx) => {
					const field = structType.fields[idx];
					if (!field) throw new Error(`Unknown field: ${field}`);

					code += `${node.name}[${field.offset}] = `;
					code += this.handleNode(key.value);
					code += `;\n`;
				});

				this.context.addVariable(node.name, structType);
			}
		}

		return code;
	}

	private handleFunctionCall(node: ASTFunctionCall): string {
		let code = "";
		code += this.handleReference(node.reference);
		code += `(`;
		node.arguments.forEach((arg, idx) => {
			code += this.handleNode(arg);
			if (idx < node.arguments.length - 1) code += `, `;
		});
		code += `)`;

		return code;
	}

	private handleReturnStatement(node: ASTReturn): string {
		let code = "";
		code += `return `;
		code += this.handleNode(node.expression);
		code += `;\n`;

		return code;
	}

	private handleReference(node: ASTReference): string {
		if (!node.child) return node.key;

		let currentRef = node.child;
		let currentType: Type = this.context.getVariable(node.key).type;
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

		recurse();

		let code = "";
		code += `${node.key}[${offset}`;
		offsetExprs.forEach(expr => (code += ` + ${expr}`));
		code += `]`;

		return code;
	}

	private handleBinaryExpression(node: ASTBinaryOperation): string {
		let code = "";
		code += "(";
		code += this.handleNode(node.left);
		code += ` ${node.operator} `;
		code += this.handleNode(node.right);
		code += ")";

		return code;
	}

	private handleFunctionDeclaration(node: ASTFunctionDeclaration): string {
		let code = "";
		code += `function ${node.name} (`;
		node.parameters.forEach((param, idx) => {
			code += `${param.name}`;
			if (idx < node.parameters.length - 1) code += `, `;
		});

		code += `) {\n`;

		node.body.forEach(node => {
			code += this.handleNode(node);
		});

		code += `}\n`;

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
		return node.value.toString();
	}
}

export { Compiler, JSCompiler };
