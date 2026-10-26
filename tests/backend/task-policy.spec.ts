// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { isTaskTimestamp, taskPermissions } from '../../backend/src/modules/work/task-policy';
import { plainToInstance } from 'class-transformer';
import { UpdateTaskDto } from '../../backend/src/modules/work/task.dto';
describe('Task timestamp and supplied-field permission boundary', () => {
  it.each(['2024-02-29T12:34:56Z', '2026-01-01T00:00:00.123+07:00', '1000-01-01T00:00:00Z', '9999-12-31T23:59:59.999Z'])(
    'accepts supported timestamp %s', (value) => expect(isTaskTimestamp(value)).toBe(true));
  it.each(['2023-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-01-01', '2026-01-01T00:00:00',
    '2026-01-01T24:00:00Z', '2026-01-01T00:00:60Z', '2026-01-01T00:00:00.1234Z',
    '1000-01-01T00:00:00+01:00', '9999-12-31T23:59:59-01:00', '2026-01-01T00:00:00+24:00', '', null, 0])(
    'rejects invalid/out-of-range timestamp %j', (value) => expect(isTaskTimestamp(value)).toBe(false));
  it.each([
    { body: { assigneeEmployeeId: null }, grants: ['task:assign'] },
    { body: { title: 'Edit' }, grants: ['task:update'] },
    { body: { title: 'Edit', assigneeEmployeeId: null }, grants: ['task:assign', 'task:update'] },
    { body: {}, grants: ['task:update'] },
  ])('uses the same field matrix before and after DTO transformation: $body', ({ body, grants }) => {
    expect(taskPermissions('PATCH', body)).toEqual(grants);
    expect(taskPermissions('PATCH', plainToInstance(UpdateTaskDto, body))).toEqual(grants);
  });
});
