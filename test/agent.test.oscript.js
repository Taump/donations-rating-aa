// uses `aa-testkit` testing framework for AA tests. Docs can be found here `https://github.com/valyakin/aa-testkit`
// `mocha` standard functions and `expect` from `chai` are available globally
// `Testkit`, `Network`, `Nodes` and `Utils` from `aa-testkit` are available globally too
const path = require('path')
const AA_PATH = '../agent.aa'

describe('Check rating AA', function () {
	this.timeout(120000);

	this.oracleData = {
		'GBYTE_USD': 100,
		'USDC_USD': 1,
		'ETH_USD': 1000,
	};

	before(async () => {
		this.network = await Network.create()
			.with.numberOfWitnesses(1)
			.with.asset({ eth: {} })
			.with.asset({ usdc: {} })
			.with.agent({ tokenRegistry: path.join(__dirname, '../node_modules/registry-aa/token-registry.oscript') })
			.with.agent({ rating: path.join(__dirname, AA_PATH) })
			.with.wallet({ oracle: { base: 1e9 } })
			.with.wallet({ alice: 100e9 })
			.with.wallet({ bob: 100e9 })
			.run();

		this.alice = this.network.wallet.alice;
		this.aliceAddress = await this.alice.getAddress();
		this.bob = this.network.wallet.bob;
		this.bobAddress = await this.bob.getAddress();
		this.oracle = this.network.wallet.oracle;
		this.oracleAddress = await this.oracle.getAddress();

		this.tokenRegistryAddress = this.network.agent.tokenRegistry;
		this.ratingAddress = this.network.agent.rating;

		this.usdcAsset = this.network.asset.usdc;
		this.ethAsset = this.network.asset.eth;
	})

	it('Issue rating asset', async () => {
		const { unit, error } = await this.network.wallet.alice.triggerAaWithData({
			toAddress: this.network.agent.rating,
			amount: 10000,
			data: {
				define: 1
			}
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnitOnNode(this.network.wallet.alice, unit)
		expect(response.response.responseVars.asset).not.to.be.undefined;
		this.ratingAsset = response.response.responseVars.asset;


		const { vars } = await this.alice.readAAStateVars(this.ratingAddress)
		expect(vars.supply).to.be.eq(0);
		expect(vars.asset).to.be.eq(this.ratingAsset);

	}).timeout(60000);


	it('Register USDC and ETH', async () => {
		const USDCSymbol = 'USDC';
		const ETHSymbol = 'ETH';

		// register USDC
		const { unit, error } = await this.network.wallet.alice.triggerAaWithData({
			toAddress: this.tokenRegistryAddress,
			amount: 1e8,
			data: {
				symbol: USDCSymbol,
				asset: this.usdcAsset,
				decimals: 4,
				description: "USDC token for testing",
			}
		})

		expect(error).to.be.null;
		expect(unit).to.be.validUnit;

		const { response } = await this.network.getAaResponseToUnitOnNode(this.network.wallet.alice, unit);

		const drawer_key = this.aliceAddress + '_' + 0 + '_' + USDCSymbol + '_' + this.usdcAsset;
		expect(response.response.responseVars.message).to.be.equal('Your description is now the current');
		expect(response.response.responseVars[USDCSymbol]).to.be.equal(this.usdcAsset);
		expect(response.response.responseVars[this.usdcAsset]).to.be.equal(USDCSymbol);
		expect(response.response.responseVars[drawer_key]).to.be.equal(1e8);

		const { vars } = await this.alice.readAAStateVars(this.tokenRegistryAddress);
		expect(vars[`a2s_${this.usdcAsset}`]).to.be.eq("USDC");


		// reg ETH
		const { unit: unit2, error: error2 } = await this.network.wallet.alice.triggerAaWithData({
			toAddress: this.tokenRegistryAddress,
			amount: 1e8,
			data: {
				symbol: ETHSymbol,
				asset: this.ethAsset,
				decimals: 9,
				description: "ETH token for testing",
			}
		})

		expect(error2).to.be.null;
		expect(unit2).to.be.validUnit;

		const { response: response2 } = await this.network.getAaResponseToUnitOnNode(this.network.wallet.alice, unit2);

		const drawer_key2 = this.aliceAddress + '_' + 0 + '_' + ETHSymbol + '_' + this.ethAsset;
		expect(response2.response.responseVars.message).to.be.equal('Your description is now the current');
		expect(response2.response.responseVars[ETHSymbol]).to.be.equal(this.ethAsset);
		expect(response2.response.responseVars[this.ethAsset]).to.be.equal(ETHSymbol);
		expect(response2.response.responseVars[drawer_key2]).to.be.equal(1e8);

		const { vars: vars2 } = await this.alice.readAAStateVars(this.tokenRegistryAddress);
		expect(vars2[`a2s_${this.ethAsset}`]).to.be.eq("ETH");
	}).timeout(60000);

	it('Post data feed', async () => {
		const { unit, error } = await this.oracle.sendMulti({
			messages: [{
				app: 'data_feed',
				payload: {
					GBYTE_USD: this.oracleData.GBYTE_USD,
					USDC_USD: this.oracleData.USDC_USD,
					ETH_USD: this.oracleData.ETH_USD,
				}
			}],
		})

		expect(error).to.be.null;
		expect(unit).to.be.validUnit;

		const { unitObj } = await this.oracle.getUnitInfo({ unit: unit });
		const dfMessage = unitObj.messages.find(m => m.app === 'data_feed');
		
		expect(dfMessage.payload.GBYTE_USD).to.be.equal(this.oracleData.GBYTE_USD);
		expect(dfMessage.payload.USDC_USD).to.be.equal(this.oracleData.USDC_USD);
		expect(dfMessage.payload.ETH_USD).to.be.equal(this.oracleData.ETH_USD);

		await this.network.witnessUntilStable(unit);
	}).timeout(60000);

	after(async () => {
		await this.network.stop()
	})
})
