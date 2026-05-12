import * as tencentcloud from 'tencentcloud-sdk-nodejs'
import { buildUserEnvPolicyStatements, buildLegacyPolicyStatements, computePolicyHash } from '../cloudbase/provision.js'
import type { PolicyBuildParams } from '../cloudbase/provision.js'

const CamClient = (tencentcloud as any).cam.v20190116.Client

const ENV_ID = process.env.ENV_ID || ''
const OWNER_UIN = process.env.TENCENTCLOUD_ACCOUNT_ID || ''
const REGION = process.env.TCB_REGION || 'ap-shanghai'
const COS_TAG_VALUE = process.env.COS_TAG_VALUE || ''
const POLICY_NAME = `coder_policy_${ENV_ID}`
const IS_LEGACY = process.argv.includes('--legacy')

async function main() {
  if (!ENV_ID) {
    console.error('ENV_ID env var is required')
    process.exit(1)
  }

  const credential = {
    secretId: process.env.TCB_SECRET_ID || process.env.TENCENT_SECRET_ID || '',
    secretKey: process.env.TCB_SECRET_KEY || process.env.TENCENT_SECRET_KEY || '',
    token: process.env.TCB_TOKEN || process.env.TENCENTCLOUD_SESSIONTOKEN || '',
  }
  if (!credential.secretId) {
    console.error('TCB_SECRET_ID not set in env')
    process.exit(1)
  }

  if (!IS_LEGACY && (!OWNER_UIN || !COS_TAG_VALUE)) {
    console.error('TENCENTCLOUD_ACCOUNT_ID and COS_TAG_VALUE env vars are required for precise policy.')
    console.error('Run with --legacy flag to use the old policy format.')
    process.exit(1)
  }

  const camClient: any = new CamClient({
    credential,
    region: '',
    profile: { httpProfile: { endpoint: 'cam.tencentcloudapi.com' } },
  })

  console.log(`[1/4] Listing policy: ${POLICY_NAME}`)
  const listResp = await camClient.ListPolicies({ Keyword: POLICY_NAME, Scope: 'Local' })
  const found = (listResp.List || []).find((p: any) => p.PolicyName === POLICY_NAME)
  if (!found) {
    console.error('Policy not found. Provision may not have run.')
    process.exit(2)
  }
  const policyId = found.PolicyId
  console.log(`  policyId = ${policyId}`)

  console.log(`[2/4] GetPolicy current content`)
  const detail = await camClient.GetPolicy({ PolicyId: policyId })
  const currentHash = computePolicyHash(String(detail.PolicyDocument))
  console.log(`  currentHash = ${currentHash}`)
  console.log('  --- BEFORE ---')
  console.log('  ' + String(detail.PolicyDocument).replace(/\n/g, '\n  '))

  // Build new policy document
  let policyStatements: any[]
  if (IS_LEGACY) {
    console.log('\n  [LEGACY MODE] Using old policy format')
    policyStatements = buildLegacyPolicyStatements(ENV_ID)
  } else {
    const params: PolicyBuildParams = {
      envId: ENV_ID,
      region: REGION,
      ownerUin: OWNER_UIN,
      cosTagValue: COS_TAG_VALUE,
    }
    console.log(`\n  [PRECISE MODE] region=${REGION}, ownerUin=${OWNER_UIN}, cosTag=${COS_TAG_VALUE}`)
    policyStatements = buildUserEnvPolicyStatements(params)
  }

  const newDoc = JSON.stringify({ version: '2.0', statement: policyStatements }, null, 0)
  const newHash = computePolicyHash(newDoc)
  console.log(`  newHash = ${newHash}`)

  if (currentHash === newHash) {
    console.log('\n[3/4] Policy document unchanged, skipping UpdatePolicy.')
    console.log('\n✓ DONE. No changes needed.')
    return
  }

  console.log(`\n[3/4] UpdatePolicy with new statements`)
  const upd = await camClient.UpdatePolicy({
    PolicyId: policyId,
    PolicyDocument: newDoc,
    Description: IS_LEGACY ? 'Coder env access (legacy refresh)' : 'Coder env access (refreshed)',
  })
  console.log('  resp:', JSON.stringify(upd))

  console.log(`[4/4] Re-fetch`)
  const after = await camClient.GetPolicy({ PolicyId: policyId })
  console.log('  --- AFTER ---')
  console.log('  ' + String(after.PolicyDocument).replace(/\n/g, '\n  '))

  console.log(`\n✓ DONE. policyHash=${newHash}`)
  console.log('  CAM changes typically take effect within ~1 minute.')
}

main().catch((err) => {
  console.error('FAILED:', err?.message || err)
  if (err?.stack) console.error(err.stack)
  process.exit(1)
})
