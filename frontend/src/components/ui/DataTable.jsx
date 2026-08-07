import EmptyState from './EmptyState.jsx';

/** Header and body cell must always get the SAME alignment class. */
function alignmentClass(align) {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

/**
 * Simple, accessible data table. Columns declare a render function so
 * cells stay presentational and the table itself stays generic.
 */
export default function DataTable({ columns, rows, rowKey, emptyState, onRowClick, footer, dense }) {
  if (!rows.length) {
    return emptyState ?? <EmptyState title="Nothing to show" description="There are no records here yet." />;
  }

  return (
    <div className="overflow-hidden">
      <div className="custom-scrollbar overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={alignmentClass(column.align)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${onRowClick ? 'cursor-pointer' : ''} ${dense ? '[&>td]:py-1.5' : ''}`}
              >
                {columns.map((column) => (
                  <td key={column.key} className={alignmentClass(column.align)}>
                    {column.render ? column.render(row) : (row[column.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
