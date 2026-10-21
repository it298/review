import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bluejayPublicError} from '../src/modules/bluejay/errors.js';
test('Blue Jay errors distinguish confirmed provider conditions without guessing from current time',()=>{
 for(const [error,code] of [[{code:'BLUEJAY_WINDOW'},'BLUEJAY_WINDOW'],[{code:'BLUEJAY_RANGE'},'BLUEJAY_RANGE'],[{status:503},'BLUEJAY_NOT_CONFIGURED'],[{status:403},'BLUEJAY_ACCESS_DENIED'],[{name:'TimeoutError'},'BLUEJAY_TIMEOUT'],[{code:'BLUEJAY_PROVIDER'},'BLUEJAY_PROVIDER'],[{},'BLUEJAY_REPORT_UNAVAILABLE']])assert.equal(bluejayPublicError(error,'Không lấy được báo cáo.').code,code);
 assert.match(bluejayPublicError({code:'BLUEJAY_WINDOW'},'').message,/16:00/);
});
test('raw provider messages, URLs, tokens and responses never reach public errors',()=>{for(const code of [undefined,'BLUEJAY_WINDOW','BLUEJAY_PROVIDER']){const safe=bluejayPublicError({code,message:'secret-value',url:'https://example.test/?apiKey=secret-value',body:{token:'secret-value'}},'Không lấy được báo cáo.');assert.equal(JSON.stringify(safe).includes('secret-value'),false);}});
