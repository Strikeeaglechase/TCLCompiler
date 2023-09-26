import { Stream } from "../stream.js";

const identifierStartChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";

const keywords = ["break", "const", "continue", "else", "elseif", "enum", "goto", "if", "return", "static", "struct", "while"];
const operands = ["+", "-", "*", "/", "%", "|", "&", "^", "||", "&&", "!", "==", "!=", "<", ">", "<=", ">="];
const symbols = ["(", ")", "[", "]", "{", "}", ";", ",", ".", "=", ":", "->"];

const operatorStartChars = [...new Set(operands.map(o => o[0]))];
const operandPrecedence: Record<string, number> = {
	"||": 2,
	"&&": 3,
	"<": 7,
	">": 7,
	"<=": 7,
	">=": 7,
	"==": 7,
	"!=": 7,
	"+": 10,
	"-": 10,
	"*": 20,
	"/": 20,
	"%": 20
};

enum TokenType {
	Keyword = "keyword",
	Operand = "operand",
	Symbol = "symbol",
	Identifier = "identifier",
	Literal = "literal"
}

interface Token {
	type: TokenType;
	value: string;
}

class Tokenizer {
	private tokens: Token[] = [];
	constructor(private input: Stream<string>) {}

	public parse() {
		while (!this.input.eof()) {
			this.parseToken();
		}

		return new Stream(this.tokens);
	}

	private parseToken() {
		const char = this.input.next();
		if (char.trim() == "") return;

		const next = this.input.peek();
		const pair = char + next;

		if (pair == "//") return this.input.skipUntil("\n");
		if (char == '"') return this.parseString();
		if (operands.includes(pair)) return this.parseOperand(pair);
		if (symbols.includes(pair)) return this.parseSymbol(pair);
		if (operands.includes(char)) return this.parseOperand(char);
		if (symbols.includes(char)) return this.parseSymbol(char);

		// Try parsing a keyword or identifier
		const chars = [char];
		while (!this.input.eof()) {
			const char = this.input.peek();
			if (symbols.includes(char)) break;
			if (char == " ") break;
			if (operatorStartChars.includes(char)) break;

			chars.push(this.input.next());
		}
		const value = chars.join("");

		if (keywords.includes(value)) {
			this.tokens.push({
				type: TokenType.Keyword,
				value: value
			});
			return;
		}

		if (identifierStartChars.includes(value[0])) {
			this.tokens.push({
				type: TokenType.Identifier,
				value: value
			});
		} else {
			this.tokens.push({
				type: TokenType.Literal,
				value: value
			});
		}
	}

	private parseOperand(value: string) {
		if (value.length == 2) this.input.next();

		this.tokens.push({
			type: TokenType.Operand,
			value: value
		});
	}

	private parseSymbol(value: string) {
		if (value.length == 2) this.input.next();

		this.tokens.push({
			type: TokenType.Symbol,
			value: value
		});
	}

	private parseString() {
		const chars = [];
		while (!this.input.eof()) {
			const char = this.input.next();
			if (char == "\\") chars.push(this.input.next());
			else {
				if (char == '"') break;
				chars.push(char);
			}
		}

		this.tokens.push({
			type: TokenType.Literal,
			value: chars.join("")
		});
	}
}

export { Tokenizer, Token, TokenType, operandPrecedence };
