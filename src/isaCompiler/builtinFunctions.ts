import { ASTFunctionCall, ASTReference } from "../parser/ast.js";
import { ISACompiler } from "./isaCompiler.js";

interface BuiltInFunction {
	name: string;

	handleCall(call: ASTFunctionCall, compiler: ISACompiler): string;
}

export const builtInFunctions: BuiltInFunction[] = [
	{
		name: "write",
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
		handleCall(call: ASTFunctionCall, compiler: ISACompiler): string {
			const ref = call.arguments[0] as ASTReference;
			if (ref.child == null && !compiler.context.doesVarExist(ref.key)) {
				const type = compiler.resolveType(ref);
				return `push ${type.size};\n`;
			}

			const { type } = compiler.getAddressOfVariable(ref);
			return `push ${type.size};\n`;
		}
	}
];
