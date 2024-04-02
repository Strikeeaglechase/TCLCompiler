import { Token } from "./tokenizer.js";

export enum ASTType {
	Prog = "Prog",
	String = "String",
	Number = "Number",
	VariableDeclaration = "VariableDeclaration",
	VariableAssignment = "VariableAssignment",
	Return = "Return",
	FunctionDeclaration = "FunctionDeclaration",
	FunctionCall = "FunctionCall",
	BinaryOperation = "BinaryOperation",
	IfStatement = "IfStatement",
	WhileStatement = "WhileStatement",
	ForStatement = "ForStatement",
	BreakStatement = "BreakStatement",
	ContinueStatement = "ContinueStatement",
	EnumStatement = "EnumStatement",
	StructStatement = "StructStatement",
	InlineStructAssignment = "InlineStructAssignment",
	InlineArrayAssignment = "InlineArrayAssignment",
	Reference = "Reference",
	GetAddress = "GetAddress",
	Dereference = "Dereference",
	PrePostOp = "PrePostOp",
	UnaryOperation = "UnaryOperation",
	Semi = "Semi",
	Invalid = "Invalid"
}

interface ASTNode {
	type: ASTType;

	line: number;
	column: number;

	lineEnd?: number;
	columnEnd?: number;
}

export interface TypedKey {
	name: Token;
	type: string;
	isPointer: boolean;
	arrExpr?: AST;
}

export interface ASTProg extends ASTNode {
	type: ASTType.Prog;
	body: AST[];
}

export interface ASTString extends ASTNode {
	type: ASTType.String;
	value: string;
}

export interface ASTNumber extends ASTNode {
	type: ASTType.Number;
	value: number;
}

export interface ASTReference extends ASTNode {
	type: ASTType.Reference;
	arrayIndex: AST | null;
	key: Token | null;
	dereference: boolean;
	child: ASTReference | null;
}

export interface ASTVariableDeclaration extends ASTNode {
	type: ASTType.VariableDeclaration;
	name: Token;
	varType: ASTReference;
	arraySizeExpression: AST | null;
	expression: AST;
}

export interface ASTGetAddress extends ASTNode {
	type: ASTType.GetAddress;
	reference: ASTReference;
}

export interface ASTDereference extends ASTNode {
	type: ASTType.Dereference;
	expression: AST;
}

export interface ASTVariableAssignment extends ASTNode {
	type: ASTType.VariableAssignment;
	reference: ASTReference;
	expression: AST;
}

export interface ASTReturn extends ASTNode {
	type: ASTType.Return;
	expression: AST;
}

export interface ASTFunctionDeclaration extends ASTNode {
	type: ASTType.FunctionDeclaration;
	name: Token;
	returnType: ASTReference;
	parameters: TypedKey[];
	body: AST[];
}

export interface ASTFunctionCall extends ASTNode {
	type: ASTType.FunctionCall;
	reference: ASTReference;
	arguments: AST[];
}

export interface ASTBinaryOperation extends ASTNode {
	type: ASTType.BinaryOperation;
	operator: Token;
	left: AST;
	right: AST;
}

export interface ASTIfStatement extends ASTNode {
	type: ASTType.IfStatement;
	condition: AST;
	body: AST[];

	elseIfs: ASTIfStatement[];
	elseBody: AST[] | null;
}

export interface ASTWhileStatement extends ASTNode {
	type: ASTType.WhileStatement;
	condition: AST;
	body: AST[];
}

export interface ASTForStatement extends ASTNode {
	type: ASTType.ForStatement;
	initialization: ASTVariableDeclaration | null;
	condition: AST | null;
	iteration: ASTVariableAssignment | null;
	body: AST[];
}

export interface ASTBreakStatement extends ASTNode {
	type: ASTType.BreakStatement;
}

export interface ASTContinueStatement extends ASTNode {
	type: ASTType.ContinueStatement;
}

export type ASTEnumValue = { name: string; value: number; nameLine: number; nameColumn: number; valueLine: number; valueColumn: number };
export interface ASTEnumStatement extends ASTNode {
	type: ASTType.EnumStatement;
	name: Token;
	values: ASTEnumValue[];
}

export interface ASTStructStatement extends ASTNode {
	type: ASTType.StructStatement;
	name: Token;

	keys: TypedKey[];

	methods: ASTFunctionDeclaration[];
}

export interface ASTInlineStructAssignment extends ASTNode {
	type: ASTType.InlineStructAssignment;
	keys: { name: Token; value: AST }[];
}

export interface ASTInlineArrayAssignment extends ASTNode {
	type: ASTType.InlineArrayAssignment;
	values: AST[];
}

export interface ASTPrePostOp extends ASTNode {
	type: ASTType.PrePostOp;
	do: AST;
	ret: AST;
	returnBefore: boolean;
}

export interface ASTUnaryOperation extends ASTNode {
	type: ASTType.UnaryOperation;
	operator: string;
	expression: AST;
}

export interface ASTSemi extends ASTNode {
	type: ASTType.Semi;
}

export type AST =
	| ASTProg
	| ASTString
	| ASTNumber
	| ASTVariableDeclaration
	| ASTVariableAssignment
	| ASTReturn
	| ASTFunctionDeclaration
	| ASTFunctionCall
	| ASTBinaryOperation
	| ASTIfStatement
	| ASTWhileStatement
	| ASTForStatement
	| ASTBreakStatement
	| ASTContinueStatement
	| ASTEnumStatement
	| ASTStructStatement
	| ASTInlineStructAssignment
	| ASTInlineArrayAssignment
	| ASTReference
	| ASTGetAddress
	| ASTDereference
	| ASTPrePostOp
	| ASTUnaryOperation
	| ASTSemi;

type DistributiveKeyOf<T> = T extends T ? keyof T : never;
export type AnyASTKey = DistributiveKeyOf<AST>;
