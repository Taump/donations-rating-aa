// uses `aa-testkit` testing framework for AA tests. Docs can be found here `https://github.com/valyakin/aa-testkit`
// `mocha` standard functions and `expect` from `chai` are available globally
// `Testkit`, `Network`, `Nodes` and `Utils` from `aa-testkit` are available globally too
const path = require('path')
const AA_PATH = '../agent.aa'

describe('Check simple AA', function () {
	this.timeout(120000)

	before(async () => {
		this.network = await Network.create()
			.with.numberOfWitnesses(1)
			.with.agent({ rating: path.join(__dirname, AA_PATH) })
			.with.wallet({ alice: 1e6 })
			.with.wallet({ bob: 1e3 })
			.run();

		this.alice = this.network.wallet.alice;
		this.aliceAddress = await this.alice.getAddress();
		this.bob = this.network.wallet.bob;
		this.bobAddress = await this.bob.getAddress();

		this.ratingAddress = this.network.agent.rating;
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

	}).timeout(60000)

	after(async () => {
		await this.network.stop()
	})
})
