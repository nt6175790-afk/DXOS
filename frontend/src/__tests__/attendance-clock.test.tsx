// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttendanceClock } from '@/features/attendance/AttendanceClock';

describe('Attendance clock', () => {
  it('uses Vietnam timezone across UTC day boundaries', () => {
    render(<AttendanceClock now={new Date('2026-10-21T18:04:31Z')} />);
    expect(screen.getByLabelText('Giờ Việt Nam 01:04:31')).toBeInTheDocument();
    expect(screen.getByText(/22\/10\/2026/)).toBeInTheDocument();
  });
  it('shows off-day state alongside the clock', () => {
    render(<AttendanceClock now={new Date('2026-10-22T00:00:00Z')} isOff />);
    expect(screen.getByText(/Hôm nay là ngày nghỉ theo lịch phân ca/)).toBeInTheDocument();
  });
});
