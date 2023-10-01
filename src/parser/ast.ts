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
	Semi = "Semi"
}

export interface TypedKey {
	name: string;
	type: string;
	isPointer: boolean;
	arrExpr?: AST;
}

export interface ASTProg {
	type: ASTType.Prog;
	body: AST[];
}

export interface ASTString {
	type: ASTType.String;
	value: string;
}

export interface ASTNumber {
	type: ASTType.Number;
	value: number;
}

export interface ASTReference {
	type: ASTType.Reference;
	arrayIndex: AST | null;
	key: string | null;
	dereference: boolean;
	child: ASTReference | null;
}

export interface ASTVariableDeclaration {
	type: ASTType.VariableDeclaration;
	name: string;
	varType: ASTReference;
	arraySizeExpression: AST | null;
	expression: AST;
}

export interface ASTGetAddress {
	type: ASTType.GetAddress;
	reference: ASTReference;
}

export interface ASTDereference {
	type: ASTType.Dereference;
	expression: AST;
}

export interface ASTVariableAssignment {
	type: ASTType.VariableAssignment;
	reference: ASTReference;
	expression: AST;
}

export interface ASTReturn {
	type: ASTType.Return;
	expression: AST;
}

export interface ASTFunctionDeclaration {
	type: ASTType.FunctionDeclaration;
	name: string;
	returnType: ASTReference;
	parameters: TypedKey[];
	body: AST[];
}

export interface ASTFunctionCall {
	type: ASTType.FunctionCall;
	reference: ASTReference;
	arguments: AST[];
}

export interface ASTBinaryOperation {
	type: ASTType.BinaryOperation;
	operator: string;
	left: AST;
	right: AST;
}

export interface ASTIfStatement {
	type: ASTType.IfStatement;
	condition: AST;
	body: AST[];

	elseIfs: ASTIfStatement[];
	elseBody: AST[] | null;
}

export interface ASTWhileStatement {
	type: ASTType.WhileStatement;
	condition: AST;
	body: AST[];
}

export interface ASTForStatement {
	type: ASTType.ForStatement;
	initialization: ASTVariableDeclaration | null;
	condition: AST | null;
	iteration: ASTVariableAssignment | null;
	body: AST[];
}

export interface ASTBreakStatement {
	type: ASTType.BreakStatement;
}

export interface ASTContinueStatement {
	type: ASTType.ContinueStatement;
}

export interface ASTEnumStatement {
	type: ASTType.EnumStatement;
	name: string;
	values: { name: string; value: number }[];
}

export interface ASTStructStatement {
	type: ASTType.StructStatement;
	name: string;

	keys: TypedKey[];

	methods: ASTFunctionDeclaration[];
}

export interface ASTInlineStructAssignment {
	type: ASTType.InlineStructAssignment;
	keys: { name: string; value: AST }[];
}

export interface ASTInlineArrayAssignment {
	type: ASTType.InlineArrayAssignment;
	values: AST[];
}

export interface ASTSemi {
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
	| ASTSemi;
