import EmptyState from './EmptyState.jsx';

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
                <th key={column.key} scope="col" className={column.align === 'right' ? 'text-right' : ''}>
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
                  <td key={column.key} className={column.align === 'right' ? 'text-right' : ''}>
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
