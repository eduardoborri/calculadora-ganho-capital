// Class of an input that sits inside a table cell or a field box: no border of its own.
export const cellInput = "w-full min-w-0 bg-transparent border-none focus:ring-0 p-0 text-primary font-semibold text-sm";

// Phone layout (max-sm), same approach as the IRPF-M tables: the table turns into a block, the
// header row is hidden and each row becomes a small card. A cell shows its column name through
// data-label (class cell-label in index.css). Wide tables keep scrolling inside their own box
// from the sm breakpoint up.
export const stackTable = "max-sm:block max-sm:min-w-0";
export const stackBody = "max-sm:block";
export const stackHead = "max-sm:hidden";
export const stackRow =
  "max-sm:grid max-sm:grid-cols-2 max-sm:items-start max-sm:gap-x-3 max-sm:gap-y-3 max-sm:px-4 max-sm:py-3 max-sm:border-b max-sm:border-rule/60 max-sm:last:border-b-0";
export const stackCell = "cell-label max-sm:p-0 max-sm:border-0 max-sm:text-left";
// A cell the user fills keeps its yellow box on the phone.
export const stackCellYellow = "cell-label max-sm:px-3 max-sm:py-2 max-sm:border-0 max-sm:rounded max-sm:text-left";
export const stackFoot = "max-sm:block";
export const stackTotalRow =
  "max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:px-4 max-sm:py-3 max-sm:border-t-[3px] max-sm:border-double max-sm:border-rule";
export const stackTotalCell = "cell-label max-sm:p-0 max-sm:border-0 max-sm:text-left";
