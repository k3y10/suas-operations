import test from 'node:test';
import assert from 'node:assert/strict';
import {reportsLocked} from '../src/field-activity-state.js';

test('completed and failed surveys release incoming reports without a separate reset',()=>{
  for(const status of ['completed','failed','canceled'])
    assert.equal(reportsLocked({quickSurvey:true,runtime:{status,action_status:status}}),false);
});
test('preparation errors and unapproved readbacks can be replaced by a new report',()=>{
  assert.equal(reportsLocked({quickSurvey:true}),false);
  assert.equal(reportsLocked({quickSurvey:true,runtime:{status:'awaiting_approval',action_status:'awaiting_approval'}}),false);
});
test('preparation and dispatch requests cannot be abandoned while in flight',()=>{
  assert.equal(reportsLocked({quickSurvey:true},true),true);
  for(const status of ['approved','queued','starting','running','unknown'])
    assert.equal(reportsLocked({runtime:{status}}),true);
  assert.equal(reportsLocked({runtime:{action_status:'executing'}}),true);
});
