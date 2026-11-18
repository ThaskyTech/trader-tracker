import { z } from 'zod'
import { CURRENCIES } from '../utils/currency.js'

// Settings a user can change about themselves. Only the display currency for now.
export const updateMeSchema = z.object({
    displayCurrency: z.enum(CURRENCIES)
})
