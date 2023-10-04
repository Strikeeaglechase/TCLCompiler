import { Stream } from "../stream.js";

const identifierStartChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";

const keywords = ["break", "const", "continue", "else", "elseif", "enum", "goto", "if", "return", "static", "struct", "while", "for"];
const operands = ["+", "-", "*", "/", "%", "|", "&", "^", "||", "&&", "!", "==", "!=", "<", ">", "<=", ">=", "~", ">>", "<<"];
const symbols = ["(", ")", "[", "]", "{", "}", ";", ",", ".", "=", ":", "->"];

const operatorStartChars = [...new Set(operands.map(o => o[0]))];
const operandPrecedence: Record<string, number> = {
	"!": 1,
	"~": 1,
	"*": 3,
	"/": 3,
	"%": 3,
	"+": 4,
	"-": 4,
	"<<": 5,
	">>": 5,
	"<": 6,
	"<=": 6,
	">": 6,
	">=": 6,
	"==": 7,
	"!=": 7,
	"&": 8,
	"^": 9,
	"|": 10,
	"&&": 11,
	"||": 12
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
		if (char == '"') return this.tokens.push(this.parseString('"'));
		if (char == "'") return this.parseChar();
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

		if (keywords.includes(value.trim())) {
			this.tokens.push({
				type: TokenType.Keyword,
				value: value.trim()
			});
			return;
		}

		if (identifierStartChars.includes(value[0])) {
			this.tokens.push({
				type: TokenType.Identifier,
				value: value.trim()
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

	private parseChar() {
		const char = this.parseString("'").value;
		if (char.length > 1) throw new Error("Invalid char literal: " + char);

		this.tokens.push({
			type: TokenType.Literal,
			value: char.charCodeAt(0).toString()
		});
		// const char = this.input.next();
		// this.input.next(); // Read '

		// this.tokens.push({
		// 	type: TokenType.Literal,
		// 	value: char.charCodeAt(0).toString()
		// });
	}

	private parseString(endChar: string) {
		const chars = [];
		const charEscapedConversions: Record<string, string> = {
			n: "\n",
			t: "\t",
			r: "\r"
		};

		while (!this.input.eof()) {
			const char = this.input.next();
			if (char == "\\") {
				// Maybe convert to newlines, tabs, etc
				const next = this.input.next();
				if (next in charEscapedConversions) {
					chars.push(charEscapedConversions[next]);
				} else {
					chars.push(next);
				}
			} else {
				if (char == endChar) break;
				chars.push(char);
			}
		}

		return {
			type: TokenType.Literal,
			value: chars.join("")
		};
	}
}

export { Tokenizer, Token, TokenType, operandPrecedence };
