export function formatCellAmount(amount){
    if(amount === null || amount === undefined) return null

    const sign = amount >= 0 ? '+' : '-'
    const abs = Math.abs(amount)

    if(abs >= 1000){
        //here we will be truncating to zero so that we never overstate our profits and loses
        const truncated = Math.floor(abs / 100) / 10
        return `${sign}$${truncated.toFixed(1)}K`
    }
    return `${sign}$${Math.floor(abs)}`
}