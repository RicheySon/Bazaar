import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/bch/contracts';

/**
 * POST /api/broadcast
 * Broadcasts a raw hex transaction to the BCH network via Electrum.
 */
export async function POST(request: NextRequest) {
    try {
        const { transactionHex } = await request.json();

        if (!transactionHex) {
            return NextResponse.json({ error: 'transactionHex is required' }, { status: 400 });
        }

        const provider = getProvider();
        const txid = await provider.sendRawTransaction(transactionHex);

        return NextResponse.json({ success: true, txid });
    } catch (error) {
        console.error('Broadcast error:', error);
        const msg = error instanceof Error ? error.message : 'Failed to broadcast transaction';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
