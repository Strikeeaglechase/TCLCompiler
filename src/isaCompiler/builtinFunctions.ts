import { ASTFunctionCall, ASTReference, TypedKey } from "../parser/ast.js";
import { TokenType } from "../parser/tokenizer.js";
import { ISACompiler } from "./isaCompiler.js";

interface BuiltInFunction {
	name: string;
	returnType: string;
	argumentTypes: TypedKey[];

	handleCall(call: ASTFunctionCall, compiler: ISACompiler): string;
}

const int = (name: string) => ({ type: "int", name: { value: name, type: TokenType.Identifier, line: 0, column: 0 }, isPointer: false });

export const builtInFunctions: BuiltInFunction[] = [
	{
		name: "write",
		returnType: "void",
		argumentTypes: [int("Address"), int("Value")],
		handleCall: (call, compiler) => {
			let code = "";
			code += compiler.handleNode(call.arguments[0]); // Address
			code += compiler.handleNode(call.arguments[1]); // Value
			code += `pop regC\n`;
			code += `pop regE\n`;
			code += `writeoff regC regE 0  # Exec write() call\n`;
			return code;
		}
	},
	{
		name: "read",
		returnType: "int",
		argumentTypes: [int("Address")],
		handleCall: (call, compiler) => {
			let code = "";
			code += compiler.handleNode(call.arguments[0]); // Address
			code += `pop regC\n`;
			code += `readoff regC 0 regC\n`;

			code += `push regC  # Push read return value\n`;

			return code;
		}
	},
	{
		name: "malloc",
		returnType: "int",
		argumentTypes: [int("Size")],
		handleCall(call: ASTFunctionCall, compiler: ISACompiler): string {
			let code = "";
			code += compiler.handleNode(call.arguments[0]);
			// code += `regC = malloc(pop())\n`;
			code += `pop regA\n`;
			code += `push hp\n`;
			code += `add hp regA hp\n`;
			return code;
		}
	},
	{
		name: "sizeof",
		returnType: "int",
		argumentTypes: [int("Type")],
		handleCall(call: ASTFunctionCall, compiler: ISACompiler): string {
			const ref = call.arguments[0] as ASTReference;
			if (ref.child == null && !compiler.context.doesVarExist(ref.key.value)) {
				const type = compiler.resolveType(ref);
				return `push ${type.size};\n`;
			}

			const { type } = compiler.getAddressOfVariable(ref);
			return `push ${type.size};\n`;
		}
	}
];
