export * from '../../../shared/finance-excel-import.js';
import {readFinanceExcel as read} from '../../../shared/finance-excel-import.js';
export async function readFinanceExcel(file){return read(file,await import('@e965/xlsx'));}
