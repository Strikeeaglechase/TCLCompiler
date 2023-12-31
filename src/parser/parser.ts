import { Stream } from "../stream.js";
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
	ASTSemi,
	ASTString,
	ASTStructStatement,
	ASTType,
	ASTUnaryOperation,
	ASTVariableAssignment,
	ASTVariableDeclaration,
	ASTWhileStatement,
	TypedKey
} from "./ast.js";
import { FileEntry } from "./linker.js";
import { operandPrecedence, Token, TokenType } from "./tokenizer.js";

class Parser {
	private types: string[] = ["void", "int"];
	private nameRewrites: Record<string, string> = {};
	private isTopLevelStatement = false;

	constructor(private tokens: Stream<Token>, private file: FileEntry) {}

	public parse() {
		const prog: ASTProg = {
			type: ASTType.Prog,
			body: []
		};

		while (!this.tokens.eof()) {
			prog.body.push(this.parseAst(true));
		}

		return prog;
	}

	private parseAst(tls: boolean = false): AST {
		this.isTopLevelStatement = tls;
		const token = this.tokens.peek();

		let result: AST;
		switch (token.type) {
			case TokenType.Identifier:
				result = this.handleIdentifier();
				break;
			case TokenType.Literal:
				result = this.handleLiteral();
				break;
			case TokenType.Symbol:
				result = this.handleSymbol();
				break;
			case TokenType.Keyword:
				result = this.handleKeyword();
				break;
			case TokenType.Operand:
				result = this.handleOperand();
				break;

			default:
				throw new Error(`Unexpected token type "${token.type}" value: ${token.value}`);
		}

		const next = this.tokens.peek();
		// console.log(`Ending out ${token.type} ${token.value}, next is ${next?.type} ${next?.value}`);
		if (!next) return result;
		// if (next.type == TokenType.Symbol && next.value == ";") {
		// 	this.tokens.next();
		// 	return result;
		// }

		if (next.type == TokenType.Operand && token.value != ";") {
			return this.handleBinaryOperation(result);
		}

		return result;
	}

	private handleKeyword(): AST {
		const keyword = this.tokens.next();
		switch (keyword.value) {
			case "if":
				return this.handleIfStatement();
			case "while":
				return this.handleWhileStatement();
			case "for":
				return this.handleForStatement();
			case "break":
				return this.handleBreakStatement();
			case "continue":
				return this.handleContinueStatement();
			case "return":
				return this.handleReturnStatement();
			case "enum":
				return this.handleEnumStatement();
			case "struct":
				return this.handleStructStatement();
			default:
				throw new Error(`Unexpected keyword "${keyword.value}"`);
		}
	}

	private parseOptionallyBracketedBody() {
		const body: AST[] = [];
		const openBracket = this.tokens.peek(); // Peak for {
		if (openBracket.type == TokenType.Symbol && openBracket.value == "{") {
			this.tokens.next(); // Read {
			while (this.tokens.peek().value != "}") {
				body.push(this.parseAst());
			}
			this.tokens.next(); // Read }
		} else {
			body.push(this.parseAst());
		}

		return body;
	}

	private handleIfStatement() {
		this.tokens.next(); // Read (
		const condition = this.parseAst();
		this.tokens.next(); // Read )

		const body = this.parseOptionallyBracketedBody();

		const elIfs: ASTIfStatement[] = [];
		this.maybeConsume(TokenType.Symbol, ";");
		let next = this.tokens.peek();
		while (next && next.type == TokenType.Keyword && next.value == "elseif") {
			this.tokens.next(); // Read elseif
			elIfs.push(this.handleIfStatement());
			this.maybeConsume(TokenType.Symbol, ";");
			next = this.tokens.peek();
		}

		let elseBody: AST[] = [];
		next = this.tokens.peek();
		if (next && next.type == TokenType.Keyword && next.value == "else") {
			this.tokens.next(); // Read else
			elseBody = this.parseOptionallyBracketedBody();
		}

		const ifStatement: ASTIfStatement = {
			type: ASTType.IfStatement,
			condition: condition,
			body: body,
			elseIfs: elIfs,
			elseBody: elseBody
		};

		return ifStatement;
	}

	private handleWhileStatement() {
		this.tokens.next(); // Read (
		const condition = this.parseAst();
		this.tokens.next(); // Read )

		const body = this.parseOptionallyBracketedBody();

		const whileStatement: ASTWhileStatement = {
			type: ASTType.WhileStatement,
			condition: condition,
			body: body
		};

		return whileStatement;
	}

	private handleForStatement() {
		this.throwIfNotConsume(TokenType.Symbol, "("); // Read (
		const initialization = this.parseAst();
		this.maybeConsume(TokenType.Symbol, ";");
		const condition = this.parseAst();
		this.maybeConsume(TokenType.Symbol, ";");
		const iteration = this.parseAst();
		this.throwIfNotConsume(TokenType.Symbol, ")"); // Read )

		const body = this.parseOptionallyBracketedBody();

		const forStatement: ASTForStatement = {
			type: ASTType.ForStatement,
			initialization: initialization as ASTVariableDeclaration,
			condition: condition,
			iteration: iteration as ASTVariableAssignment,
			body: body
		};

		return forStatement;
	}

	private handleBreakStatement(): AST {
		return { type: ASTType.BreakStatement };
	}

	private handleContinueStatement(): AST {
		return { type: ASTType.ContinueStatement };
	}

	private handleReturnStatement() {
		const expression = this.parseAst();
		const returnStatement: ASTReturn = {
			type: ASTType.Return,
			expression: expression
		};

		return returnStatement;
	}

	private handleEnumStatement() {
		const name = this.tokens.next().value;
		const values: { name: string; value: number }[] = [];

		this.tokens.next(); // Read {

		let index = 0;
		while (!this.maybeConsume(TokenType.Symbol, "}")) {
			const name = this.tokens.next().value;
			const colon = this.tokens.peek();
			if (colon.type == TokenType.Symbol && colon.value == ":") {
				this.tokens.next(); // Read :
				const value = this.tokens.next().value;
				values.push({ name: name.trim(), value: Number(value) });
			} else {
				values.push({ name: name.trim(), value: index });
			}

			index++;
			this.maybeConsume(TokenType.Symbol, ",");
		}

		const enumStatement: ASTEnumStatement = {
			type: ASTType.EnumStatement,
			name: this.maybeRewriteName(name),
			values: values
		};

		return enumStatement;
	}

	private handleStructStatement() {
		const name = this.maybeRewriteName(this.tokens.next().value);
		const keys: TypedKey[] = [];
		const methods: ASTFunctionDeclaration[] = [];

		this.tokens.next(); // Read {

		while (this.tokens.peek().value != "}") {
			const type = this.tokens.next().value;
			const isPointerType = this.maybeConsume(TokenType.Operand, "*");
			const isArrayType = this.maybeConsume(TokenType.Symbol, "[");
			let arraySizeExpression: AST = null;
			if (isArrayType) {
				arraySizeExpression = this.parseAst();
				this.throwIfNotConsume(TokenType.Symbol, "]");
			}

			const name = this.tokens.next().value;

			const next = this.tokens.peek();
			if (next.type == TokenType.Symbol && next.value == "(") {
				const retType = this.parseKnownSingleTokenReference(type, isPointerType);
				methods.push(this.handleFunctionDeclaration(name, retType, true));
			} else {
				keys.push({ name: name, type: type, arrExpr: arraySizeExpression, isPointer: isPointerType || isArrayType });
				this.tokens.next(); // Read ;
			}
		}

		this.tokens.next(); // Read }

		const structStatement: ASTStructStatement = {
			type: ASTType.StructStatement,
			name: name,
			keys: keys,
			methods: methods
		};

		this.types.push(name);

		return structStatement;
	}

	private getStructInlineKeys() {
		const keys: { name: string; value: AST }[] = [];
		while (!this.maybeConsume(TokenType.Symbol, "}")) {
			const key = this.tokens.next();

			this.tokens.next(); // Read :
			if (this.maybeConsume(TokenType.Symbol, "{")) {
				const subStructKeys = this.getStructInlineKeys();
				subStructKeys.forEach(subKey => {
					keys.push({ name: `${key.value}.${subKey.name}`, value: subKey.value });
				});
			} else {
				const value = this.parseAst();
				keys.push({ name: key.value, value: value });
			}

			this.maybeConsume(TokenType.Symbol, ",");
		}

		return keys;
	}

	private handleInlineAssignment() {
		const next = this.tokens.peek();
		const after = this.tokens.peekOver();

		if (next.type == TokenType.Identifier && after.type == TokenType.Symbol && after.value == ":") {
			// Struct assignment
			const keys = this.getStructInlineKeys();
			const structAssignment: ASTInlineStructAssignment = {
				type: ASTType.InlineStructAssignment,
				keys: keys
			};
			return structAssignment;
		} else {
			// Array assignment

			const values: AST[] = [];
			while (true) {
				const next = this.tokens.peek();
				if (next.type == TokenType.Symbol && next.value == "}") break;

				const value = this.parseAst();
				values.push(value);
				const maybeComma = this.tokens.peek();
				if (maybeComma.type == TokenType.Symbol && maybeComma.value == ",") this.tokens.next();
			}

			this.tokens.next(); // Read }

			const arrayAssignment: ASTInlineArrayAssignment = {
				type: ASTType.InlineArrayAssignment,
				values: values
			};

			return arrayAssignment;
		}
	}

	private handleSymbol() {
		const symbol = this.tokens.next();
		switch (symbol.value) {
			case "(": {
				const result = this.parseAst();
				this.tokens.next(); // Read )
				return result;
			}

			case "{":
				return this.handleInlineAssignment();

			case ";": {
				const semi: ASTSemi = { type: ASTType.Semi };
				return semi;
			}

			default:
				throw new Error(`Unexpected symbol "${symbol.value}"`);
		}
	}

	private handlePointerDeref() {
		const derefRef = this.parseAst();
		if (derefRef.type == ASTType.Reference) {
			const deref: ASTDereference = {
				type: ASTType.Dereference,
				expression: derefRef
			};

			return deref;
		}

		if (derefRef.type == ASTType.VariableAssignment) {
			derefRef.reference.dereference = true;
			return derefRef;
		}

		const deref: ASTDereference = {
			type: ASTType.Dereference,
			expression: derefRef
		};

		return deref;
	}

	private handleOperand() {
		const operand = this.tokens.next();
		switch (operand.value) {
			case "*": {
				return this.handlePointerDeref();
			}
			case "&": {
				const ref = this.parseAst() as ASTReference;
				const getAddress: ASTGetAddress = {
					type: ASTType.GetAddress,
					reference: ref
				};

				return getAddress;
			}
			case "-":
			case "~":
			case "!": {
				const expression = this.parseAst();
				const unary: ASTUnaryOperation = {
					type: ASTType.UnaryOperation,
					operator: operand.value,
					expression: expression
				};

				return unary;
			}
			default:
				throw new Error(`Unexpected operand "${operand.value}"`);
		}
	}

	private handleBinaryOperation(leftHand: AST, prec = 0) {
		const operator = this.tokens.peek();
		if (!operator || operator.type != TokenType.Operand) {
			return leftHand;
		}

		this.tokens.next();

		const opPrec = operandPrecedence[operator.value];
		if (!opPrec) throw new Error(`No operand precedence for ${operator.value}`);

		if (opPrec > prec) {
			const rightHand = this.handleBinaryOperation(this.parseAst(), opPrec);
			const binOp: AST = {
				type: ASTType.BinaryOperation,
				operator: operator.value,
				left: leftHand,
				right: rightHand
			};

			return this.handleBinaryOperation(binOp, prec);
		} else {
			return leftHand;
		}
	}

	private handleLiteral() {
		const token = this.tokens.next();
		const numerics = "-0123456789";
		if (numerics.includes(token.value[0])) {
			const numericBaseStarters = {
				"0b": 2,
				"0o": 8,
				"0d": 10,
				"0x": 16
			};

			const starter = token.value.slice(0, 2).toLowerCase();
			if (numericBaseStarters[starter]) {
				const base = numericBaseStarters[starter];
				const restNum = token.value.slice(2);
				const num = parseInt(restNum, base);
				const numAst: ASTNumber = {
					type: ASTType.Number,
					value: num
				};
				return numAst;
			} else {
				const num: ASTNumber = {
					type: ASTType.Number,
					value: Number(token.value)
				};
				return num;
			}
		}

		const str: ASTString = {
			type: ASTType.String,
			value: token.value
		};

		return str;
	}

	private parseKnownSingleTokenReference(token: string, pointer: boolean) {
		const ref: ASTReference = {
			type: ASTType.Reference,
			arrayIndex: null,
			key: token,
			child: null,
			dereference: pointer
		};

		return ref;
	}

	private parseReference(firstIdent: string) {
		const topRef: ASTReference = {
			type: ASTType.Reference,
			arrayIndex: null,
			key: firstIdent,
			child: null,
			dereference: false
		};
		let ref = topRef;

		while (!this.tokens.eof()) {
			const next = this.tokens.peek();
			if (next.type != TokenType.Symbol || (next.value != "." && next.value != "[" && next.value != "->")) break;

			const dotOrBracket = this.tokens.next();
			if (dotOrBracket.type == TokenType.Symbol && (dotOrBracket.value == "." || dotOrBracket.value == "->")) {
				const key = this.tokens.next().value;
				const newRef: ASTReference = {
					type: ASTType.Reference,
					arrayIndex: null,
					key: key,
					child: null,
					dereference: dotOrBracket.value == "->"
				};

				ref.child = newRef;
				ref = newRef;
			} else {
				// Array reference
				const expression = this.parseAst();
				this.tokens.next(); // Read ]
				const newRef: ASTReference = {
					type: ASTType.Reference,
					arrayIndex: expression,
					key: null,
					child: null,
					dereference: true
				};
				// ref.dereference = true;
				ref.child = newRef;
				ref = newRef;
			}
		}

		this.maybeRewriteRef(topRef);

		return topRef;
	}

	private handleIdentifier() {
		const identifier = this.tokens.next();
		const reference = this.parseReference(identifier.value);

		const next = this.tokens.peek();

		// Handle assignment
		if (next.type == TokenType.Symbol && next.value == "=") {
			return this.handleAssignment(reference);
		}

		// Identifier is a type, may be a pointer declaration
		if (this.types.includes(identifier.value) && next.type == TokenType.Operand && next.value == "*") {
			const after = this.tokens.peekOver();
			if (after.type == TokenType.Identifier) {
				this.tokens.next(); // Read *
				reference.dereference = true;
				return this.handleDeclaration(reference);
			}
		}

		// Next thing is an identifier, some sort of declaration
		if (next.type == TokenType.Identifier) {
			return this.handleDeclaration(reference);
		}

		// Next thing is an open paren, function call
		if (next.type == TokenType.Symbol && next.value == "(") {
			return this.handleFunctionCall(reference);
		}

		if (next.type == TokenType.Operand && (next.value == "+" || next.value == "-")) {
			const nextOver = this.tokens.peekOver();
			if (nextOver.type == TokenType.Operand && (nextOver.value == "+" || nextOver.value == "-")) {
				this.tokens.next(); // Read + or -
				const op = this.tokens.next(); // Read + or -

				const unary: ASTPrePostOp = {
					type: ASTType.PrePostOp,
					do: {
						type: ASTType.VariableAssignment,
						reference: reference,
						expression: {
							type: ASTType.BinaryOperation,
							operator: op.value,
							left: reference,
							right: {
								type: ASTType.Number,
								value: 1
							}
						}
					},
					ret: reference,
					returnBefore: true
				};

				return unary;
			}
		}

		if (next.type == TokenType.Operand) {
			const nextOver = this.tokens.peekOver();
			if (nextOver.type == TokenType.Symbol && nextOver.value == "=") {
				const op = this.tokens.next(); // Read operator
				this.tokens.next(); // Read =

				const binary: ASTBinaryOperation = {
					type: ASTType.BinaryOperation,
					operator: op.value,
					left: reference,
					right: this.parseAst()
				};

				const assignment: ASTVariableAssignment = {
					type: ASTType.VariableAssignment,
					reference: reference,
					expression: binary
				};

				return assignment;
			}
		}

		// Otherwise, just a reference
		return reference;
	}

	private handleAssignment(ref: ASTReference) {
		this.tokens.next(); // Read =
		const expression = this.parseAst();
		const assignment: ASTVariableAssignment = {
			type: ASTType.VariableAssignment,
			reference: ref,
			expression: expression
		};

		return assignment;
	}

	private handleFunctionCall(ref: ASTReference) {
		this.tokens.next(); // Read (
		const args: AST[] = [];
		while (!this.maybeConsume(TokenType.Symbol, ")")) {
			this.maybeConsume(TokenType.Symbol, ",");
			const ast = this.parseAst();
			args.push(ast);
		}

		this.maybeRewriteRef(ref);

		const funcCall: ASTFunctionCall = {
			type: ASTType.FunctionCall,
			reference: ref,
			arguments: args
		};

		return funcCall;
	}

	private handleDeclaration(ref: ASTReference) {
		const name = this.tokens.next().value;

		const next = this.tokens.peek();
		if (next.type != TokenType.Symbol) {
			throw new Error(`Unexpected token type "${next.type}" value: "${next.value}" (expected symbol)`);
		}

		// Variable declaration
		if (next.value == "=" || next.value == ";") return this.handleVariableDeclaration(name, ref);
		// Function declaration
		if (next.value == "(") return this.handleFunctionDeclaration(name, ref);
	}

	private handleVariableDeclaration(name: string, varTypeRef: ASTReference) {
		const hasExpression = this.maybeConsume(TokenType.Symbol, "=");
		let arraySizeExpression: AST = null;

		// Type identifier is an array which really means this is an array type
		if (varTypeRef.child && varTypeRef.child.arrayIndex) {
			arraySizeExpression = varTypeRef.child.arrayIndex;

			varTypeRef.child = null;
			varTypeRef.dereference = true;
		}

		const expression = hasExpression ? this.parseAst() : null;
		const decl: ASTVariableDeclaration = {
			type: ASTType.VariableDeclaration,
			name: this.maybeRewriteName(name),
			varType: varTypeRef,
			expression: expression,
			arraySizeExpression: arraySizeExpression
		};

		return decl;
	}

	private handleFunctionDeclaration(name: string, returnTypeRef: ASTReference, preventRewrite = false) {
		if (!preventRewrite) name = this.maybeRewriteName(name, true);
		this.tokens.next(); // Read (

		const params: TypedKey[] = [];
		const body: AST[] = [];
		while (!this.maybeConsume(TokenType.Symbol, ")")) {
			this.maybeConsume(TokenType.Symbol, ",");

			const paramType = this.tokens.next();
			const isPointer = this.maybeConsume(TokenType.Operand, "*");
			const paramName = this.tokens.next();
			params.push({ type: paramType.value, name: paramName.value, isPointer: isPointer });
		}

		const openBracket = this.tokens.peek(); // Peak for {

		if (openBracket.type == TokenType.Symbol && openBracket.value == "{") {
			this.tokens.next(); // Read {
			while (!this.maybeConsume(TokenType.Symbol, "}")) {
				body.push(this.parseAst());
			}
		} else {
			const returnAst: ASTReturn = {
				type: ASTType.Return,
				expression: this.parseAst()
			};
			body.push(returnAst);
		}

		const func: ASTFunctionDeclaration = {
			type: ASTType.FunctionDeclaration,
			name: this.maybeRewriteName(name),
			parameters: params,
			body: body,
			returnType: returnTypeRef
		};

		return func;
	}

	private maybeRewriteName(name: string, allowNonTls = false) {
		if (this.nameRewrites[name]) return this.nameRewrites[name];
		if (this.file.exportSymbols.includes(name) || this.file.isRoot) return name;
		if (name.startsWith("__")) return name;
		if (!this.isTopLevelStatement && !allowNonTls) return name;

		const newName = `__${this.file.name}_${name}`;
		this.nameRewrites[name] = newName;
		return newName;
	}

	private maybeRewriteRef(ref: ASTReference) {
		if (this.nameRewrites[ref.key]) {
			ref.key = this.nameRewrites[ref.key];
		}
	}

	private maybeConsume(type: TokenType, value: string) {
		const next = this.tokens.peek();
		if (next.type == type && next.value == value) {
			this.tokens.next();
			return true;
		}

		return false;
	}

	private throwIfNotConsume(type: TokenType, value: string) {
		const consumed = this.maybeConsume(type, value);
		if (!consumed) throw new Error(`Expected ${type} ${value}`);
	}
}

export { Parser };
