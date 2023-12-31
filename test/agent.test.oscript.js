// uses `aa-testkit` testing framework for AA tests. Docs can be found here `https://github.com/valyakin/aa-testkit`
// `mocha` standard functions and `expect` from `chai` are available globally
// `Testkit`, `Network`, `Nodes` and `Utils` from `aa-testkit` are available globally too
const path = require('path');
const { ATTESTOR_MNEMONIC, BOUNCE_FEE, DONATION_STORAGE_FEE } = require('./constants');

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
			.with.agent({ attestation_aa: path.join(__dirname, '../node_modules/github-attestation/github.aa') })
			.with.agent({ cascadingDonations: path.join(__dirname, '../node_modules/cascading-donations-aa/agent.aa') })
			.with.agent({ rating: path.join(__dirname, AA_PATH) })
			.with.wallet({ attestor: 100e9 }, ATTESTOR_MNEMONIC)
			// .with.wallet({ oracle: { base: 1e9 } })
			.with.wallet({ alice: {base: 100e9, usdc: 100e9, eth: 100e9} })
			.with.wallet({ bob: {base: 100e9, usdc: 100e9, eth: 100e9} })
			.run();

		this.alice = this.network.wallet.alice;
		this.aliceAddress = await this.alice.getAddress();
		this.bob = this.network.wallet.bob;
		this.bobAddress = await this.bob.getAddress();
		this.bobRatingAmount = 0;
		// this.oracle = this.network.wallet.oracle;
		// this.oracleAddress = await this.oracle.getAddress();
		this.attestor = this.network.wallet.attestor;
		this.attestorAddress = await this.attestor.getAddress();

		this.tokenRegistryAddress = this.network.agent.tokenRegistry;
		this.ratingAddress = this.network.agent.rating;
		this.cascadingDonationsAddress = this.network.agent.cascadingDonations;
		this.attestationAddress = this.network.agent.attestation_aa;

		this.usdcAsset = this.network.asset.usdc;
		this.ethAsset = this.network.asset.eth;

		this.repo1 = 'alice/first';
		this.repo2 = 'alice/second';
		this.repo3 = 'alice/third';
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
		const { unit, error } = await this.attestor.sendMulti({
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

		const { unitObj } = await this.attestor.getUnitInfo({ unit });
		const dfMessage = unitObj.messages.find(m => m.app === 'data_feed');

		expect(dfMessage.payload.GBYTE_USD).to.be.equal(this.oracleData.GBYTE_USD);
		expect(dfMessage.payload.USDC_USD).to.be.equal(this.oracleData.USDC_USD);
		expect(dfMessage.payload.ETH_USD).to.be.equal(this.oracleData.ETH_USD);

		await this.network.witnessUntilStable(unit);
	}).timeout(60000);

	it('Publish alice attestation profile', async () => {
		const { unit, error } = await this.network.wallet.attestor.sendMulti({
			outputs_by_asset: {
				base: [{ address: this.attestationAddress, amount: BOUNCE_FEE }]
			},
			messages: [
				{
					app: 'attestation',
					payload_location: 'inline',
					payload: {
						address: this.aliceAddress,
						profile: {
							github_username: 'alice'
						}
					}
				},
				{
					app: 'data',
					payload: {
						address: this.aliceAddress,
						github_username: 'alice',
					}
				},
			]
		})

		expect(unit).to.be.validUnit
		expect(error).to.be.null
		await this.network.witnessUntilStable(unit)
	}).timeout(60000);

	it('Alice set rules and notification AA for her repo', async () => {
		const rules = {
			[this.repo2]: 30,
			[this.repo3]: 30
		};

		const { unit, error } = await this.network.wallet.alice.triggerAaWithData({
			toAddress: this.cascadingDonationsAddress,
			amount: 1e4,
			data: {
				set_rules: 1,
				repo: this.repo1,
				rules
			}
		});

		expect(error).to.be.null;
		expect(unit).to.be.validUnit;

		const { response } = await this.network.getAaResponseToUnitOnNode(this.network.wallet.alice, unit);

		expect(response.response.responseVars.new_rules).to.be.equal(JSON.stringify(rules));

		const { unit: unit2, error: error2 } = await this.network.wallet.alice.triggerAaWithData({
			toAddress: this.cascadingDonationsAddress,
			amount: 1e4,
			data: {
				notification_aa: this.ratingAddress,
				repo: this.repo1,
			}
		});

		expect(error2).to.be.null;
		expect(unit2).to.be.validUnit;

		const { response: response2 } = await this.network.getAaResponseToUnitOnNode(this.network.wallet.alice, unit2);

		expect(response2.response.responseVars.message).to.be.equal(`Set notification AA for ${this.repo1}`);

	}).timeout(60000);
	
	it('Bob donate GBYTE to repo1 and notify rating AA', async () => {
		const { unit, error } = await this.bob.triggerAaWithData({
			toAddress: this.cascadingDonationsAddress,
			amount: 1e9, // 1 GBYTE
			data: {
				repo: this.repo1,
				donate: 1
			}
		});

		expect(error).to.be.null;
		expect(unit).to.be.validUnit;

		const { response } = await this.network.getAaResponseToUnitOnNode(this.network.wallet.alice, unit);

		const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit })

		expect(Utils.getExternalPayments(unitObj)).to.deep.equalInAnyOrder([
			{
				address: this.ratingAddress,
				amount: 100,
			}
		]);

		const amount = 1e9 - 1e3;

		this.bobRatingAmount += amount;

		expect(unitObj.messages.find((m)=> m.app==='data')?.payload).to.deep.equalInAnyOrder(
			{
				repo: this.repo1,
				donor: this.bobAddress,
				amount,
				asset: 'base'
			}
		);

		const { vars } = await this.alice.readAAStateVars(this.ratingAddress)
		
		expect(vars.supply).to.be.eq(amount);
		expect(vars[`rating*${this.bobAddress}`]).to.be.eq(amount);
		expect(vars[`rating*${this.repo1}*${this.bobAddress}`]).to.be.eq(amount);
		
		const { response: response2 } = await this.network.getAaResponseToUnitOnNode(this.network.wallet.alice, response.response_unit);

		expect(Utils.getExternalPayments(response2.objResponseUnit)).to.deep.equalInAnyOrder([
			{
				address: this.bobAddress,
				amount,
				asset: this.ratingAsset
			}
		]);
	});



	it('Bob donate USDC to repo1 and notify rating AA', async () => {
		const usdcAmount = 10e4;

		const { unit, error } = await this.bob.sendMulti({
			base_outputs: [
				{
					address: this.cascadingDonationsAddress,
					amount: BOUNCE_FEE
				}
			],
			asset_outputs: [
				{
					address: this.cascadingDonationsAddress,
					amount: usdcAmount
				}
			],
			asset: this.usdcAsset,
			messages: [
				{
					app: 'data',
					payload_location: 'inline',
					payload: {
						donate: 1,
						repo: this.repo1
					}
				}
			]
		})

		expect(error).to.be.null;
		expect(unit).to.be.validUnit;

		const { response } = await this.network.getAaResponseToUnitOnNode(this.network.wallet.alice, unit);

		const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit })

		expect(Utils.getExternalPayments(unitObj)).to.deep.equalInAnyOrder([
			{
				address: this.ratingAddress,
				amount: 100,
			}
		]);

		expect(unitObj.messages.find((m)=> m.app==='data')?.payload).to.deep.equalInAnyOrder(
			{
				repo: this.repo1,
				donor: this.bobAddress,
				amount: usdcAmount,
				asset: this.usdcAsset
			}
		);

		const { vars } = await this.alice.readAAStateVars(this.ratingAddress);

		const rate = this.oracleData.USDC_USD / this.oracleData.GBYTE_USD;

		const amount = Math.floor((usdcAmount / 10 ** 4) * rate * 1e9);

		this.bobRatingAmount += amount;
		
		expect(vars.supply).to.be.eq(this.bobRatingAmount);
		expect(vars[`rating*${this.bobAddress}`]).to.be.eq(this.bobRatingAmount);
		expect(vars[`rating*${this.repo1}*${this.bobAddress}`]).to.be.eq(this.bobRatingAmount);
		
		const { response: response2 } = await this.network.getAaResponseToUnitOnNode(this.network.wallet.alice, response.response_unit);

		expect(Utils.getExternalPayments(response2.objResponseUnit)).to.deep.equalInAnyOrder([
			{
				address: this.bobAddress,
				amount,
				asset: this.ratingAsset
			}
		]);
	});

	after(async () => {
		await this.network.stop()
	})
})
