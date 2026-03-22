import Table from 'cli-table3';
import picocolors from 'picocolors';

export type TableAlignment = 'left' | 'center' | 'right';

export interface TableColumn<Row> {
  header: string;
  align?: TableAlignment;
  getValue: (row: Row) => string;
  minWidth?: number;
  maxWidth?: number;
  shrinkPriority?: number;
}

const DEFAULT_TERM_WIDTH = 120;
const MIN_COLUMN_WIDTH = 4;
const COLUMN_GAP = 2;
const ELLIPSIS = '…';

const MINIMAL_TABLE_CHARS = {
  top: '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  bottom: '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  left: '',
  'left-mid': '',
  mid: '',
  'mid-mid': '',
  right: '',
  'right-mid': '',
  middle: '  ',
} as const;

function isColorEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function accent(text: string): string {
  return picocolors.createColors(isColorEnabled()).cyan(text);
}

function resolveTerminalWidth(): number {
  const override = Number.parseInt(process.env.MODEL_PICKER_TERM_WIDTH ?? '', 10);
  if (Number.isFinite(override) && override > 0) {
    return override;
  }

  return process.stdout.columns && process.stdout.columns > 0
    ? process.stdout.columns
    : DEFAULT_TERM_WIDTH;
}

function clampWidth(width: number, minWidth: number, maxWidth: number | undefined): number {
  const bounded = Math.max(width, minWidth);
  return maxWidth ? Math.min(bounded, maxWidth) : bounded;
}

function resolveIdealWidths<Row>(rows: Row[], columns: TableColumn<Row>[]): number[] {
  return columns.map((column) => {
    const widestCell = rows.reduce((widest, row) => {
      return Math.max(widest, column.getValue(row).length);
    }, 0);

    const minWidth = Math.max(MIN_COLUMN_WIDTH, column.minWidth ?? column.header.length);
    const desiredWidth = Math.max(minWidth, column.header.length, widestCell);
    return clampWidth(desiredWidth, minWidth, column.maxWidth);
  });
}

function resolveMinWidths<Row>(columns: TableColumn<Row>[]): number[] {
  return columns.map((column) => {
    return Math.max(MIN_COLUMN_WIDTH, column.minWidth ?? column.header.length);
  });
}

function measureTableWidth(widths: number[]): number {
  if (widths.length === 0) {
    return 0;
  }

  return widths.reduce((total, width) => total + width, 0) + (widths.length - 1) * COLUMN_GAP;
}

function shrinkWidths<Row>(
  widths: number[],
  minWidths: number[],
  columns: TableColumn<Row>[],
  maxTableWidth: number,
): number[] {
  const shrinkOrder = columns
    .map((column, index) => ({
      index,
      priority: column.shrinkPriority ?? 0,
    }))
    .sort((left, right) => right.priority - left.priority)
    .map((entry) => entry.index);

  while (measureTableWidth(widths) > maxTableWidth) {
    let shrank = false;

    for (const index of shrinkOrder) {
      const width = widths[index];
      const minWidth = minWidths[index];
      if (width === undefined || minWidth === undefined || width <= minWidth) {
        continue;
      }

      widths[index] = width - 1;
      shrank = true;

      if (measureTableWidth(widths) <= maxTableWidth) {
        return widths;
      }
    }

    if (!shrank) {
      return widths;
    }
  }

  return widths;
}

function resolveColumnWidths<Row>(rows: Row[], columns: TableColumn<Row>[]): number[] {
  const idealWidths = resolveIdealWidths(rows, columns);
  const minWidths = resolveMinWidths(columns);
  return shrinkWidths(idealWidths, minWidths, columns, resolveTerminalWidth());
}

export function renderTable<Row>(rows: Row[], columns: TableColumn<Row>[]): string {
  const table = new Table({
    head: columns.map((column) => accent(column.header)),
    colAligns: columns.map((column) => column.align ?? 'left'),
    colWidths: resolveColumnWidths(rows, columns),
    truncate: ELLIPSIS,
    wordWrap: false,
    wrapOnWordBoundary: false,
    style: {
      compact: true,
      'padding-left': 0,
      'padding-right': 0,
      head: [],
      border: [],
    },
    chars: MINIMAL_TABLE_CHARS,
  });

  for (const row of rows) {
    table.push(columns.map((column) => column.getValue(row)));
  }

  return table.toString();
}
