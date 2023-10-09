## Instructions

| Instruction | Arg0 (32) | Arg1 (32) | Arg2 (32) | Opcode (8) | Description                                              |
| ----------- | --------- | --------- | --------- | ---------- | -------------------------------------------------------- |
| `nop`       |           |           |           | `0x00`     | No operation                                             |
| `halt`      |           |           |           | `0x01`     | Halt                                                     |
| `mov`       | `src`     |           | `dst`     | `0x02`     | Moves one register (or imm) into another                 |
| `movif`     | `src`     | `cond`    | `dst`     | `0x03`     | Moves one register (or imm) into another if cond is true |
| `add`       | `a`       | `b`       | `dst`     | `0x06`     | Adds two registers together                              |
| `sub`       | `a`       | `b`       | `dst`     | `0x07`     | Subtracts two registers                                  |
| `mul`       | `a`       | `b`       | `dst`     | `0x08`     | Multiplies two registers                                 |
| `div`       | `a`       | `b`       | `dst`     | `0x09`     | Divides two registers                                    |
| `mod`       | `a`       | `b`       | `dst`     | `0x0A`     | Modulo of two registers                                  |
| `and`       | `a`       | `b`       | `dst`     | `0x0B`     | Bitwise and of two registers                             |
| `or`        | `a`       | `b`       | `dst`     | `0x0C`     | Bitwise or of two registers                              |
| `xor`       | `a`       | `b`       | `dst`     | `0x0D`     | Bitwise xor of two registers                             |
| `not`       | `a`       |           | `dst`     | `0x0E`     | Bitwise not of a register                                |
| `shl`       | `a`       | `b`       | `dst`     | `0x0F`     | Shifts a register left by another register               |
| `shr`       | `a`       | `b`       | `dst`     | `0x10`     | Shifts a register right by another register              |
| `cmpeq`     | `a`       | `b`       | `dst`     | `0x11`     | Compares two registers to be equal                       |
| `cmpne`     | `a`       | `b`       | `dst`     | `0x12`     | Compares two registers to be not equal                   |
| `cmplt`     | `a`       | `b`       | `dst`     | `0x13`     | Compares two registers to be less than                   |
| `cmple`     | `a`       | `b`       | `dst`     | `0x14`     | Compares two registers to be less than or equal          |
| `readoff`   | `addr`    | `offset`  | `dst`     | `0x15`     | Reads from memory at addr + offset and stores in dst     |
| `writeoff`  | `addr`    | `src`     | `offset`  | `0x16`     | Writes to memory at addr + offset from src               |
| `push`      | `val`     |           |           | `0x17`     | Pushes a value onto the stack                            |
| `pop`       |           |           | `dst`     | `0x18`     | Pops a value off the stack into dst                      |

## Argument types

| Type      | Code (3) | Description                        |
| --------- | -------- | ---------------------------------- |
| `imm`     | `0x1`    | Immediate value                    |
| `reg`     | `0x2`    | Register                           |
| `mem`     | `0x3`    | Immediate memory address           |
| `pop`     | `0x4`    | Pop from stack and use as value    |
| `popaddr` | `0x5`    | Pop from stack and use as address  |
| `regref`  | `0x6`    | Use a register to read from memory |

## Registers

| Name | Code (8) | Description       |
| ---- | -------- | ----------------- |
| `pc` | `0x1`    | Program counter   |
| `sp` | `0x2`    | Stack pointer     |
| `fp` | `0x3`    | Frame pointer     |
| `hp` | `0x4`    | Heap pointer      |
| `r0` | `0x5`    | GP Math A         |
| `r1` | `0x6`    | GP Math B         |
| `r2` | `0x7`    | GP Temp           |
| `r3` | `0x8`    | GP Function Setup |
| `r4` | `0x9`    | GP Pointer Logic  |

## Instruction line

```
| --                   64                                 --| | -      64        -|
| --                   32                     -- | | - 32 - | | - 32 - | | - 32 - |
| - 8 - | | - 3 - | | - 3 - | | - 3 - | | - 15 - | | - 32 - | | - 32 - | | - 32 - |
<opcode>  <a0Opt>   <a1Opt>   <a2Opt>    [unused]  <a0>       <a1>       <a1>

```

## ALU Commands

| Command | Code (4) | Description |
| ------- | -------- | ----------- |
| `add`   | `0x01`   | Add A + B   |
| `sub`   | `0x02`   | Sub A - B   |
| `mul`   | `0x03`   | Mul A \* B  |
| `div`   | `0x04`   | Div A / B   |
| `mod`   | `0x05`   | Mod A % B   |
| `and`   | `0x06`   | And A & B   |
| `or`    | `0x07`   | Or A \| B   |
| `xor`   | `0x08`   | Xor A ^ B   |
| `not`   | `0x09`   | Not A       |
| `shl`   | `0x0A`   | Shl A << B  |
| `shr`   | `0x0B`   | Shr A >> B  |
| `cmpeq` | `0x0C`   | Cmp A == B  |
| `cmpne` | `0x0D`   | Cmp A != B  |
| `cmplt` | `0x0E`   | Cmp A < B   |
| `cmple` | `0x0F`   | Cmp A <= B  |
