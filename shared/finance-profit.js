import {financeCategories} from './finance.js';
export function profitAndLoss(summary){
 const cost=new Map();for(const c of [...summary.categories.filter(c=>c.kind==='expense'),...(summary.expensePayments||[])])cost.set(c.category,(cost.get(c.category)||0)+c.amount);
 const cogs=cost.get('cogs')||0,operating=[...cost].filter(([key])=>key!=='cogs'),gross=summary.revenue==null?null:summary.revenue-cogs;
 return {revenue:summary.revenue,cogs,gross,operating:operating.map(([category,amount])=>({category,label:financeCategories[category],amount})),expenses:summary.expenses,result:summary.provisionalResult};
}
