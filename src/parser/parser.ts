import { Stream } from "../stream.js";
import {
	AST,
	ASTBinaryOperation,
	ASTDereference,
	ASTEnumStatement,
	ASTEnumValue,
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

type Positional = { line: number; column: number; lineEnd?: number; columnEnd?: number };
function getLastPos(ast: Positional | Positional[], fallback?: Positional) {
	if ((Array.isArray(ast) && ast.length == 0) || !ast) return getLastPos(fallback);
	const last = Array.isArray(ast) ? ast[ast.length - 1] : ast;
	if (last.lineEnd) {
		return {
			line: last.lineEnd,
			column: last.columnEnd
		};
	}

	return {
		line: last.line,
		column: last.column
	};
}

function correctOrderPos(a: Positional, b: Positional) {
	const sameLine = a.line == b.line;
	if (a.line < b.line || (sameLine && a.column < b.column)) {
		const bEnd = getLastPos(b);
		return {
			line: a.line,
			column: a.column,

			lineEnd: bEnd.line,
			columnEnd: bEnd.column
		};
	} else {
		const aEnd = getLastPos(a);
		return {
			line: b.line,
			column: b.column,

			lineEnd: aEnd.line,
			columnEnd: aEnd.column
		};
	}
}

interface ParserError {
	token: Token;
	message: string;
	line: number;
	column: number;
}

class Parser {
	private types: string[] = ["void", "int"];
	private nameRewrites: Record<string, string> = {};
	private isTopLevelStatement = false;

	public errors: ParserError[] = [];

	constructor(private tokens: Stream<Token>, private file: FileEntry) {}

	public parse() {
		const prog: ASTProg = {
			type: ASTType.Prog,
			body: [],
			line: 0,
			column: 0
		};

		while (!this.tokens.eof()) {
			prog.body.push(this.parseAst(true));
		}

		return prog;
	}

	private parseAst(tls: boolean = false): AST {
		this.isTopLevelStatement = tls;
		const token = this.tokens.peek();

		try {
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
		} catch (e) {
			console.log(`Error parsing token ${token.type} ${token.value} at ${token.line}:${token.column}: `);
			console.log(`\t` + e.message);

			this.errors.push({
				token: token,
				message: e.message,
				line: token.line,
				column: token.column
			});

			return null;
		}
	}

	private handleKeyword(): AST {
		const keyword = this.tokens.next();
		switch (keyword.value) {
			case "if":
				return this.handleIfStatement(keyword);
			case "while":
				return this.handleWhileStatement(keyword);
			case "for":
				return this.handleForStatement(keyword);
			case "break":
				return this.handleBreakStatement(keyword);
			case "continue":
				return this.handleContinueStatement(keyword);
			case "return":
				return this.handleReturnStatement(keyword);
			case "enum":
				return this.handleEnumStatement(keyword);
			case "struct":
				return this.handleStructStatement(keyword);
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

	private handleIfStatement(orgToken: Token) {
		this.tokens.next(); // Read (
		const condition = this.parseAst();
		this.tokens.next(); // Read )

		const body = this.parseOptionallyBracketedBody();
		const end = getLastPos(body);

		const elIfs: ASTIfStatement[] = [];
		this.maybeConsume(TokenType.Symbol, ";");
		let next = this.tokens.peek();
		while (next && next.type == TokenType.Keyword && next.value == "elseif") {
			const nextIfToken = this.tokens.next(); // Read elseif
			elIfs.push(this.handleIfStatement(nextIfToken));
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
			elseBody: elseBody,

			line: orgToken.line,
			column: orgToken.column,
			lineEnd: end.line,
			columnEnd: end.column
		};

		return ifStatement;
	}

	private handleWhileStatement(orgToken: Token) {
		this.tokens.next(); // Read (
		const condition = this.parseAst();
		this.tokens.next(); // Read )

		const body = this.parseOptionallyBracketedBody();
		const end = getLastPos(body);

		const whileStatement: ASTWhileStatement = {
			type: ASTType.WhileStatement,
			condition: condition,
			body: body,

			line: orgToken.line,
			column: orgToken.column,
			lineEnd: end.line,
			columnEnd: end.column
		};

		return whileStatement;
	}

	private handleForStatement(orgToken: Token) {
		this.throwIfNotConsume(TokenType.Symbol, "("); // Read (
		const initialization = this.parseAst();
		this.maybeConsume(TokenType.Symbol, ";");
		const condition = this.parseAst();
		this.maybeConsume(TokenType.Symbol, ";");
		const iteration = this.parseAst();
		this.throwIfNotConsume(TokenType.Symbol, ")"); // Read )

		const body = this.parseOptionallyBracketedBody();
		const end = getLastPos(body);

		const forStatement: ASTForStatement = {
			type: ASTType.ForStatement,
			initialization: initialization as ASTVariableDeclaration,
			condition: condition,
			iteration: iteration as ASTVariableAssignment,
			body: body,

			line: orgToken.line,
			column: orgToken.column,
			lineEnd: end.line,
			columnEnd: end.column
		};

		return forStatement;
	}

	private handleBreakStatement(orgToken: Token): AST {
		return { type: ASTType.BreakStatement, line: orgToken.line, column: orgToken.column };
	}

	private handleContinueStatement(orgToken: Token): AST {
		return { type: ASTType.ContinueStatement, line: orgToken.line, column: orgToken.column };
	}

	private handleReturnStatement(orgToken: Token) {
		const expression = this.parseAst();
		const end = getLastPos(expression);
		const returnStatement: ASTReturn = {
			type: ASTType.Return,
			expression: expression,

			line: orgToken.line,
			column: orgToken.column,
			lineEnd: end.line,
			columnEnd: end.column
		};

		return returnStatement;
	}

	private handleEnumStatement(orgToken: Token) {
		const name = this.tokens.next();
		const values: ASTEnumValue[] = [];

		this.tokens.next(); // Read {

		let index = 0;
		let lastToken: Token;
		while (!this.maybeConsume(TokenType.Symbol, "}")) {
			const nameToken = this.tokens.next();
			const colon = this.tokens.peek();
			if (colon.type == TokenType.Symbol && colon.value == ":") {
				this.tokens.next(); // Read :
				const valueToken = this.tokens.next();
				values.push({
					name: nameToken.value.trim(),
					nameLine: nameToken.line,
					nameColumn: nameToken.column,

					value: Number(valueToken.value),
					valueLine: valueToken.line,
					valueColumn: valueToken.column
				});
			} else {
				values.push({
					name: nameToken.value.trim(),
					nameLine: nameToken.line,
					nameColumn: nameToken.column,

					value: index,
					valueLine: 0,
					valueColumn: 0
				});
			}

			lastToken = colon;

			index++;
			this.maybeConsume(TokenType.Symbol, ",");
		}

		const enumStatement: ASTEnumStatement = {
			type: ASTType.EnumStatement,
			name: this.maybeRewriteName(name),
			values: values,

			line: orgToken.line,
			column: orgToken.column,
			lineEnd: lastToken.line,
			columnEnd: lastToken.column
		};

		return enumStatement;
	}

	private handleStructStatement(orgToken: Token) {
		const name = this.maybeRewriteName(this.tokens.next());
		const keys: TypedKey[] = [];
		const methods: ASTFunctionDeclaration[] = [];

		this.tokens.next(); // Read {

		while (this.tokens.peek().value != "}") {
			const typeToken = this.tokens.next();
			const isPointerType = this.maybeConsume(TokenType.Operand, "*");
			const isArrayType = this.maybeConsume(TokenType.Symbol, "[");
			let arraySizeExpression: AST = null;
			if (isArrayType) {
				arraySizeExpression = this.parseAst();
				this.throwIfNotConsume(TokenType.Symbol, "]");
			}

			const nameToken = this.tokens.next();

			const next = this.tokens.peek();
			if (next.type == TokenType.Symbol && next.value == "(") {
				const retType = this.parseKnownSingleTokenReference(typeToken, isPointerType);
				methods.push(this.handleFunctionDeclaration(nameToken, retType, true));
			} else {
				keys.push({ name: nameToken, type: typeToken.value, arrExpr: arraySizeExpression, isPointer: isPointerType || isArrayType });
				this.tokens.next(); // Read ;
			}
		}

		const lastToken = this.tokens.next(); // Read }

		const structStatement: ASTStructStatement = {
			type: ASTType.StructStatement,
			name: name,
			keys: keys,
			methods: methods,

			line: orgToken.line,
			column: orgToken.column,
			lineEnd: lastToken.line,
			columnEnd: lastToken.column
		};

		this.types.push(name.value);

		return structStatement;
	}

	private getStructInlineKeys() {
		const keys: { name: Token; value: AST }[] = [];
		let lastToken: Token;
		while (!(lastToken = this.maybeConsumeAndReturn(TokenType.Symbol, "}"))) {
			const key = this.tokens.next();

			this.tokens.next(); // Read :
			if (this.maybeConsume(TokenType.Symbol, "{")) {
				const { keys: subStructKeys } = this.getStructInlineKeys();
				subStructKeys.forEach(subKey => {
					const newToken = JSON.parse(JSON.stringify(key));
					newToken.value = `${key.value}.${subKey.name.value}`;
					keys.push({ name: newToken, value: subKey.value });
				});
			} else {
				const value = this.parseAst();
				keys.push({ name: key, value: value });
			}

			this.maybeConsume(TokenType.Symbol, ",");
		}

		return { keys, lastToken };
	}

	private handleInlineAssignment(orgToken: Token) {
		const next = this.tokens.peek();
		const after = this.tokens.peekOver();

		if (next.type == TokenType.Identifier && after.type == TokenType.Symbol && after.value == ":") {
			// Struct assignment
			const { keys, lastToken } = this.getStructInlineKeys();
			const structAssignment: ASTInlineStructAssignment = {
				type: ASTType.InlineStructAssignment,
				keys: keys,

				line: orgToken.line,
				column: orgToken.column,
				lineEnd: lastToken.line,
				columnEnd: lastToken.column
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

			const lastToken = this.tokens.next(); // Read }

			const arrayAssignment: ASTInlineArrayAssignment = {
				type: ASTType.InlineArrayAssignment,
				values: values,

				line: orgToken.line,
				column: orgToken.column,
				lineEnd: lastToken.line,
				columnEnd: lastToken.column
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
				return this.handleInlineAssignment(symbol);

			case ";": {
				const semi: ASTSemi = { type: ASTType.Semi, line: symbol.line, column: symbol.column };
				return semi;
			}

			default:
				throw new Error(`Unexpected symbol "${symbol.value}"`);
		}
	}

	private handlePointerDeref(orgToken: Token) {
		const derefRef = this.parseAst();
		const end = getLastPos(derefRef);
		if (derefRef.type == ASTType.Reference) {
			const deref: ASTDereference = {
				type: ASTType.Dereference,
				expression: derefRef,

				line: orgToken.line,
				column: orgToken.column,
				lineEnd: end.line,
				columnEnd: end.column
			};

			return deref;
		}

		if (derefRef.type == ASTType.VariableAssignment) {
			derefRef.reference.dereference = true;
			return derefRef;
		}

		const deref: ASTDereference = {
			type: ASTType.Dereference,
			expression: derefRef,

			line: orgToken.line,
			column: orgToken.column,
			lineEnd: end.line,
			columnEnd: end.column
		};

		return deref;
	}

	private handleOperand() {
		const operand = this.tokens.next();
		switch (operand.value) {
			case "*": {
				return this.handlePointerDeref(operand);
			}
			case "&": {
				const ref = this.parseAst() as ASTReference;
				const end = getLastPos(ref);
				const getAddress: ASTGetAddress = {
					type: ASTType.GetAddress,
					reference: ref,

					line: operand.line,
					column: operand.column,
					lineEnd: end.line,
					columnEnd: end.column
				};

				return getAddress;
			}
			case "-":
			case "~":
			case "!": {
				const expression = this.parseAst();
				const end = getLastPos(expression);
				const unary: ASTUnaryOperation = {
					type: ASTType.UnaryOperation,
					operator: operand.value,
					expression: expression,

					line: operand.line,
					column: operand.column,
					lineEnd: end.line,
					columnEnd: end.column
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
				operator: operator,
				left: leftHand,
				right: rightHand,

				...correctOrderPos(leftHand, rightHand)
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
					value: num,

					line: token.line,
					column: token.column
				};
				return numAst;
			} else {
				const num: ASTNumber = {
					type: ASTType.Number,
					value: Number(token.value),

					line: token.line,
					column: token.column
				};
				return num;
			}
		}

		const str: ASTString = {
			type: ASTType.String,
			value: token.value,

			line: token.line,
			column: token.column
		};

		return str;
	}

	private parseKnownSingleTokenReference(token: Token, pointer: boolean) {
		const ref: ASTReference = {
			type: ASTType.Reference,
			arrayIndex: null,
			key: token,
			child: null,
			dereference: pointer,

			line: token.line,
			column: token.column
		};

		return ref;
	}

	private parseReference(firstIdent: Token) {
		const topRef: ASTReference = {
			type: ASTType.Reference,
			arrayIndex: null,
			key: firstIdent,
			child: null,
			dereference: false,

			line: firstIdent.line,
			column: firstIdent.column
		};
		let ref = topRef;

		while (!this.tokens.eof()) {
			const next = this.tokens.peek();
			if (next.type != TokenType.Symbol || (next.value != "." && next.value != "[" && next.value != "->")) break;

			const dotOrBracket = this.tokens.next();
			if (dotOrBracket.type == TokenType.Symbol && (dotOrBracket.value == "." || dotOrBracket.value == "->")) {
				const keyToken = this.tokens.next();
				const newRef: ASTReference = {
					type: ASTType.Reference,
					arrayIndex: null,
					key: keyToken,
					child: null,
					dereference: dotOrBracket.value == "->",

					line: dotOrBracket.line,
					column: dotOrBracket.column
				};

				ref.child = newRef;
				ref = newRef;
			} else {
				// Array reference
				const expression = this.parseAst();
				const lastToken = this.tokens.next(); // Read ]
				const newRef: ASTReference = {
					type: ASTType.Reference,
					arrayIndex: expression,
					key: null,
					child: null,
					dereference: true,

					line: dotOrBracket.line,
					column: dotOrBracket.column,
					lineEnd: lastToken.line,
					columnEnd: lastToken.column
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
		const reference = this.parseReference(identifier);

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
							operator: op,
							left: reference,
							right: {
								type: ASTType.Number,
								value: 1,
								line: op.line,
								column: op.column
							},
							line: op.line,
							column: op.column
						},
						line: op.line,
						column: op.column
					},
					ret: reference,
					returnBefore: true,

					...correctOrderPos(reference, op)
				};

				return unary;
			}
		}

		if (next.type == TokenType.Operand) {
			const nextOver = this.tokens.peekOver();
			if (nextOver.type == TokenType.Symbol && nextOver.value == "=") {
				const op = this.tokens.next(); // Read operator
				this.tokens.next(); // Read =

				const right = this.parseAst();
				const binary: ASTBinaryOperation = {
					type: ASTType.BinaryOperation,
					operator: op,
					left: reference,
					right: right,

					...correctOrderPos(reference, right)
				};

				const assignment: ASTVariableAssignment = {
					type: ASTType.VariableAssignment,
					reference: reference,
					expression: binary,

					...correctOrderPos(reference, binary)
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
			expression: expression,

			...correctOrderPos(ref, expression)
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

		const end = getLastPos(args, ref);
		const funcCall: ASTFunctionCall = {
			type: ASTType.FunctionCall,
			reference: ref,
			arguments: args,

			line: ref.line,
			column: ref.column,

			lineEnd: end.line,
			columnEnd: end.column
		};

		return funcCall;
	}

	private handleDeclaration(ref: ASTReference) {
		const nameToken = this.tokens.next();

		const next = this.tokens.peek();
		if (next.type != TokenType.Symbol) {
			throw new Error(`Unexpected token type "${next.type}" value: "${next.value}" (expected symbol)`);
		}

		// Variable declaration
		if (next.value == "=" || next.value == ";") return this.handleVariableDeclaration(nameToken, ref);
		// Function declaration
		if (next.value == "(") return this.handleFunctionDeclaration(nameToken, ref);
	}

	private handleVariableDeclaration(name: Token, varTypeRef: ASTReference) {
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
			arraySizeExpression: arraySizeExpression,

			line: name.line,
			column: name.column,
			lineEnd: varTypeRef.line,
			columnEnd: varTypeRef.column
		};

		return decl;
	}

	private handleFunctionDeclaration(nameToken: Token, returnTypeRef: ASTReference, preventRewrite = false) {
		// let name = nameToken.value;
		if (!preventRewrite) nameToken = this.maybeRewriteName(nameToken, true);
		this.tokens.next(); // Read (

		const params: TypedKey[] = [];
		const body: AST[] = [];
		while (!this.maybeConsume(TokenType.Symbol, ")")) {
			this.maybeConsume(TokenType.Symbol, ",");

			const paramType = this.tokens.next();
			const isPointer = this.maybeConsume(TokenType.Operand, "*");
			const paramName = this.tokens.next();
			params.push({ type: paramType.value, name: paramName, isPointer: isPointer });
		}

		const openBracket = this.tokens.peek(); // Peak for {

		if (openBracket.type == TokenType.Symbol && openBracket.value == "{") {
			this.tokens.next(); // Read {
			while (!this.maybeConsume(TokenType.Symbol, "}")) {
				body.push(this.parseAst());
			}
		} else {
			const retAst = this.parseAst();
			const end = getLastPos(retAst);
			const returnAst: ASTReturn = {
				type: ASTType.Return,
				expression: retAst,

				line: nameToken.line,
				column: nameToken.column,
				lineEnd: end.line,
				columnEnd: end.column
			};
			body.push(returnAst);
		}

		const end = getLastPos(body);
		const func: ASTFunctionDeclaration = {
			type: ASTType.FunctionDeclaration,
			name: this.maybeRewriteName(nameToken),
			parameters: params,
			body: body,
			returnType: returnTypeRef,

			line: nameToken.line,
			column: nameToken.column,
			lineEnd: end.line,
			columnEnd: end.column
		};

		return func;
	}

	private maybeRewriteName(name: Token, allowNonTls = false): Token {
		const newNameToken = JSON.parse(JSON.stringify(name));
		if (this.nameRewrites[name.value]) {
			newNameToken.value = this.nameRewrites[name.value];
			return newNameToken;
		}

		if (this.file.exportSymbols.includes(name.value) || this.file.isRoot) return name;
		if (name.value.startsWith("__")) return name;
		if (!this.isTopLevelStatement && !allowNonTls) return name;

		const newName = `__${this.file.name}_${name.value}`;
		this.nameRewrites[name.value] = newName;
		newNameToken.value = newName;
		return newNameToken;
	}

	private maybeRewriteRef(ref: ASTReference) {
		if (this.nameRewrites[ref.key.value]) {
			ref.key.value = this.nameRewrites[ref.key.value];
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

	private maybeConsumeAndReturn(type: TokenType, value: string) {
		const next = this.tokens.peek();
		if (next.type == type && next.value == value) {
			return this.tokens.next();
		}

		return null;
	}

	private throwIfNotConsume(type: TokenType, value: string) {
		const consumed = this.maybeConsume(type, value);
		if (!consumed) throw new Error(`Expected ${type} ${value}`);
	}
}

export { Parser, ParserError };
