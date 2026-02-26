#!/usr/bin/env node

const CONTRACTS = [
  {
    name: 'FractionalClaims',
    address: 'bchtest:pd540ypmpg4sl65pggpecmddfvcanuwveaydt0qqwvcmzl9fl6vl60cw42jsa'
  },
  {
    name: 'FractionalVault',
    address: 'bchtest:p0hev5gg3vhq3zkn2jhhj8y8rq2gnlt0fz4f460vpkf56lhuvv9ly7mju5zfh'
  },
  {
    name: 'Marketplace',
    address: 'bchtest:pwqhtec02e37qnfejja60pm72e6act2eh07xgxlwr2ls38l6ygakxghqwkz4d'
  },
  {
    name: 'Auction',
    address: 'bchtest:pwhtpzcfvzpt0ydzqknrzwwnj7qd5sz4jsp4j4wh7tdlnh84fz59xypaw0zkh'
  },
  {
    name: 'AuctionState',
    address: 'bchtest:pwvjmx9tjl5lyw7nws0f8587tkgfsh9h65m3yuju8aqk2hgttetn5qy5e7zkz'
  },
  {
    name: 'CollectionBid',
    address: 'bchtest:pd44kq9rs2tlm7cy9ewcljajk6drpdatwdrlxmnlz87rm0wfv3y0x00dpj4qh'
  },
  {
    name: 'P2PKH',
    address: 'bchtest:pdl35znqhy5tals7xxe9f6v7vtcarqfa322tnd3wfk89sss75n2eqjvllsscz'
  }
];

async function checkBalance(address) {
  try {
    // Using blockchair.com API for BCH testnet (Chipnet)
    const url = `https://blockchair.com/bitcoin-cash/testnet/address/${address}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.data && data.data[address]) {
      const balance = data.data[address].balance;
      return balance;
    }
    return 0;
  } catch (error) {
    console.error(`Error checking balance for ${address}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('CONTRACT FUNDING VERIFICATION (Chipnet Testnet)');
  console.log('='.repeat(80) + '\n');

  let totalFunded = 0;
  let fullyFunded = 0;

  for (const contract of CONTRACTS) {
    process.stdout.write(`Checking ${contract.name}... `);
    const balance = await checkBalance(contract.address);
    
    if (balance === null) {
      console.log('⚠️  Could not verify');
    } else if (balance > 0) {
      console.log(`✅ FUNDED (${balance} satoshis)`);
      totalFunded++;
      fullyFunded += balance;
    } else {
      console.log('❌ NOT FUNDED');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`SUMMARY: ${totalFunded}/7 contracts funded`);
  console.log(`TOTAL BALANCE: ${fullyFunded} satoshis (~${(fullyFunded / 100000000).toFixed(8)} BCH)`);
  console.log('='.repeat(80) + '\n');

  if (totalFunded === 7) {
    console.log('✅ ALL CONTRACTS FULLY FUNDED - Ready for deployment!\n');
  } else {
    console.log(`⚠️  ${7 - totalFunded} contracts still need funding\n`);
  }
}

main().catch(console.error);
