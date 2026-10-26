// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PERMISSIONS } from '../../rbac/permission-catalog';
import { objectSchema, ToolArgumentError } from './tool.types';
import type { AiTool, ToolOutcome } from './tool.types';

const OPERATIONS = ['sum', 'average', 'difference', 'ratio', 'percentage', 'percent_change', 'percentage_points'] as const;
type Operation = (typeof OPERATIONS)[number];
const BINARY: readonly Operation[] = ['difference', 'ratio', 'percentage', 'percent_change', 'percentage_points'];

export class CalculateArgs {
  @IsIn(OPERATIONS) operation!: Operation;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  values!: number[];
  @IsOptional() @IsInt() @Min(0) @Max(4) decimals?: number;
}

/** Exact arithmetic for the model. No expression parsing and no eval. */
export function calculate(operation: Operation, values: number[], decimals = 2): number {
  if (BINARY.includes(operation) && values.length !== 2) throw new ToolArgumentError('EXPECTED_TWO_VALUES');
  const d = values.map((v) => new Prisma.Decimal(v));
  const divide = (a: Prisma.Decimal, b: Prisma.Decimal) => {
    if (b.isZero()) throw new ToolArgumentError('DIVISION_BY_ZERO');
    return a.div(b);
  };
  let result: Prisma.Decimal;
  switch (operation) {
    case 'sum': result = d.reduce((a, b) => a.add(b), new Prisma.Decimal(0)); break;
    case 'average': result = d.reduce((a, b) => a.add(b), new Prisma.Decimal(0)).div(d.length); break;
    case 'difference': result = d[0].sub(d[1]); break;
    case 'ratio': result = divide(d[0], d[1]); break;
    case 'percentage': result = divide(d[0], d[1]).mul(100); break;
    case 'percent_change': result = divide(d[1].sub(d[0]), d[0].abs()).mul(100); break;
    case 'percentage_points': result = d[1].sub(d[0]); break;
  }
  return result.toDecimalPlaces(decimals, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

@Injectable()
export class CalculateTool implements AiTool<CalculateArgs> {
  readonly name = 'calculate';
  readonly description = 'Exact arithmetic. ALWAYS use this instead of computing numbers yourself. ' +
    'sum/average: all values. difference: values[0]-values[1]. ratio: values[0]/values[1]. ' +
    'percentage: values[0]/values[1]*100 (part of a whole). percent_change: relative change from values[0] (old) to values[1] (new), in %. ' +
    'percentage_points: values[1]-values[0] for two percentages (old, new).';
  readonly parameters = objectSchema({
    operation: { type: 'string', enum: [...OPERATIONS] },
    values: { type: 'array', items: { type: 'number' }, minItems: 1, maxItems: 50 },
    decimals: { type: 'integer', minimum: 0, maximum: 4, description: 'Rounding, default 2.' },
  }, ['operation', 'values']);
  readonly argsType = CalculateArgs;
  readonly requiredPermissions = [PERMISSIONS.AI_USE];

  async execute(args: CalculateArgs): Promise<ToolOutcome> {
    const result = calculate(args.operation, args.values, args.decimals ?? 2);
    return { status: 'OK', data: { operation: args.operation, inputs: args.values, result } };
  }
}
