import { findSyncableAccounts, isDue, syncAccount } from './sync.service.js'

// The ~10 minute sync loop (D-10, D-65). A plain timer: there's one server and one job,
// so a scheduling library would add nothing. Accounts are synced one at a time, and a
// tick that's still running when the next one is due makes that one skip, so runs
// never overlap. Failing accounts wait longer between tries (isDue).

const INTERVAL_MS = 10 * 60e3
const FIRST_RUN_MS = 30e3

export function startScheduler({ intervalMs = INTERVAL_MS, firstRunMs = FIRST_RUN_MS } = {}){
    if(process.env.SYNC_DISABLED === 'true'){
        console.log('Broker sync is disabled (SYNC_DISABLED=true).')
        return () => {}
    }

    let ticking = false
    async function tick(){
        if(ticking) return
        ticking = true
        try {
            for(const { id } of await findSyncableAccounts()){
                if(!isDue(id)) continue
                const result = await syncAccount(id)
                // Binance limits by IP, which every account shares: stop for this round.
                if(result.kind === 'RATE_LIMIT') break
            }
        } catch (err) {
            console.error('Sync round failed:', err)
        } finally {
            ticking = false
        }
    }

    const first = setTimeout(tick, firstRunMs)
    const timer = setInterval(tick, intervalMs)
    return () => { clearTimeout(first); clearInterval(timer) }
}
