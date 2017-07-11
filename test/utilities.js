var BN = require('bn.js');
const abi = require("ethereumjs-abi");
var PLCRVoting = artifacts.require("./PLCRVoting.sol");
var HttpProvider = require('ethjs-provider-http');
var EthRPC = require('ethjs-rpc');
var ethRPC = new EthRPC(new HttpProvider('http://localhost:8545'));
var EthQuery = require('ethjs-query');
var ethQuery = new EthQuery(new HttpProvider('http://localhost:8545'));
var fs = require("fs");

function increaseTime(seconds) {
    return new Promise((resolve, reject) => { 
        return ethRPC.sendAsync({
            method: 'evm_increaseTime',
            params: [seconds]
        }, (err) => {
            if (err) reject(err)
            resolve()
        })
    })
        .then(() => {
            return new Promise((resolve, reject) => { 
                return ethRPC.sendAsync({
                    method: 'evm_mine',
                    params: []
                }, (err) => {
                    if (err) reject(err)
                    resolve()
                })
            })
        })
}

contract('Utilities', function(accounts) {
    // Check for non-existence of the single poll
    // and then the existence of the poll and then that the poll
    // is in commit phase
    const [owner, user1, user2, user3, user4, user5, user6, user7, user8, user9] = accounts;

    const utilConf = JSON.parse(fs.readFileSync("./conf/testUtilities.json"));

    var trustedAccounts = [];
    utilConf.trustedAccounts.forEach((idx) => trustedAccounts.push(accounts[idx]));

    function getVoteContract() {
        return PLCRVoting.deployed();
    }

    function launchPoll(proposal) {
        return getVoteContract()
            .then((vote) => vote.startPoll(proposal, 50))
            .then((result) => result.logs[0].args.pollID.toString());
    }

    function getPoll(pollID) {
        return getVoteContract()
            .then((instance) => instance.pollMap.call(pollID));
    }

    function getBlockTimestamp() {
        return ethQuery.blockNumber()
            .then((num) => ethQuery.getBlockByNumber(num,true))
            .then((block) => block.timestamp.toString(10));
    }

    // returns the solidity-sha3 output for vote hashing
    function createVoteHash(vote, salt) {
        let hash = "0x" + abi.soliditySHA3([ "uint", "uint" ],
        [ vote, salt ]).toString('hex'); 
        return hash;                                   
    }

    /*
    function increaseTime(seconds) {
        return new Promise(function(resolve, reject){
            web3.currentProvider.sendAsync(
                {
                    jsonrpc: "2.0",
                    method: "evm_increaseTime",
                    params: [seconds],
                    id: 0
                },
                resolve()
            );
        });
    }
    */

    // commitDuration is a base 10 string
    // getBlockTimestamp is also a base 10 string
    // getPoll also returns everything as base10 string

    it("check proposal string from start poll event", function() {
        const propStr = "first poll";
        let contract;
        return getVoteContract()
            .then((instance) => contract = instance)
            .then(() => contract.startPoll(propStr, 50))
            .then((result) => result.logs[0].args.pollID.toString())
            .then((pollID) => getPoll(pollID))
            .then((pollArr) => assert.equal(pollArr[0], propStr, "poll created incorrectly"))
    });

    it("check getProposalString function", function() {
        const propStr = "my poll";
        let contract;
        return getVoteContract()
            .then((instance) => contract = instance)
            .then(() => contract.startPoll(propStr, 50))
            .then((result) => result.logs[0].args.pollID.toString())
            .then((pollID) => contract.getProposalString.call(pollID))
            .then((result) => assert.equal(result, propStr, "getProposalString function incorrect"))
    
    });

    it("check commit end date", function() {
        let contract;
        let pollID;
        let commitEndDate;
        let commitDuration;
        let timestamp;
        return getVoteContract()
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((num) => commitDuration = new BN(String(num), 10))
            .then(() => launchPoll('commit poll'))
            .then((num) => pollID = num)
            .then(() => getBlockTimestamp())
            .then((time) => timestamp = new BN(time, 10))
            .then(() => getPoll(pollID))
            .then((poll) => commitEndDate = poll[1])
            .then(() => assert.equal(commitEndDate, timestamp.add(commitDuration).toString(10), "poll commit end date wrong"));
    });

    it("check reveal end date", function() {
        let contract;
        let pollID;
        let revealEndDate;
        let commitDuration;
        let revealDuration;
        let timestamp;
        return getVoteContract()
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((dur) => commitDuration = new BN(String(dur), 10))
            .then(() => contract.revealDuration.call())
            .then((dur) => revealDuration = new BN(String(dur), 10))
            .then(() => launchPoll('reveal poll'))
            .then((num) => pollID = num)
            .then(() => getBlockTimestamp())
            .then((time) => timestamp = new BN(time, 10))
            .then(() => getPoll(pollID))
            .then((poll) => revealEndDate = poll[2])
            .then(() => assert.equal(revealEndDate, timestamp.add(commitDuration).add(revealDuration).toString(10), "poll reveal end date wrong")); 
    });


    it("start three polls", function() {
        // Check for existence of the three polls and that they 
        // are in commit phase   
        let contract;
        const propStr = "poll";

        return launchPoll(1+propStr)
            .then((pollID) => getPoll(pollID))
            .then((pollArr) => assert.equal(pollArr[0], 1+propStr, "poll created incorrectly"))
            .then(() => launchPoll(2+propStr))
            .then((pollID) => getPoll(pollID))
            .then((pollArr) => assert.equal(pollArr[0], 2+propStr, "poll created incorrectly"))
            .then(() => launchPoll(3+propStr))
            .then((pollID) => getPoll(pollID))
            .then((pollArr) => assert.equal(pollArr[0], 3+propStr, "poll created incorrectly"));
    });


    it("check if commit period correctly active", function() {
        // Check commit period active, reveal period inactive, poll not ended
        let pollIDinstance;
        return launchPoll("commit period test")
            .then((pollID) => {
                pollIDinstance = pollID; 
                return getVoteContract();
            })
            .then((vote) => vote.commitPeriodActive.call(pollIDinstance))
            .then((result) => assert.equal(result, true, "Poll wasn't active"));
    });


    it("check if reveal period correctly active", function() {
        // Check commit period inactive, reveal period active
        let pollID;
        let contract;
        return launchPoll("reveal period test") 
            .then((id) => pollID = id)
            .then(() => getVoteContract())
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((dur) => increaseTime(Number(dur)+1))
            .then(() => contract.pollMap.call(pollID))
            .then(() => contract.revealPeriodActive.call(pollID))
            .then((result) => assert.equal(result, true, "Poll wasn't in reveal"));
    });

    /*
     ***Test this modifier through functionality***
    it("check if poll ended", function() {
    // Check commit inactive, reveal inactive, poll ended
        let pollID;
        let contract;
        return launchPoll("poll end test") 
        .then((id) => pollID = id)
        .then(() => increaseTime(210))
        .then(() => getVoteContract())
        .then((instance) => instance.pollEnded.call(pollID))
        .then((result) => assert.equal(result, true, "Poll had not ended"));
    });
    */


    it("trusted users are correct", function() {
        // Check if the trusted users are correct
        return PLCRVoting.deployed()
            .then((vote) => {
                accounts.forEach((account) => {
                    var isTrustedAccount = trustedAccounts.includes(account);

                    return vote.isTrusted.call(account)
                        .then((trustVal) => assert.equal(
                            trustVal, isTrustedAccount, "Trusted map was incorrect"
                        ));
                });
            });
    });


    it("valid poll IDs when in commit period", function() {
        // Check if the started polls in the commit period are valid,
        let pollID;
        let contract;
        return launchPoll("valid poll ID test in commit") 
            .then((id) => pollID = id)
            .then(() => getVoteContract())
            .then((instance) => instance.validPollID.call(pollID))
            .then((result) => assert.equal(result, true, "Poll isn't valid in commit period"));
    });

    it("valid poll IDs when in reveal period", function() {
        // Check if the started polls in the reveal period are valid,
        let pollID;
        let contract;
        return launchPoll("reveal period test") 
            .then((id) => pollID = id)
            .then(() => getVoteContract())
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((dur) => increaseTime(Number(dur)+1))
            .then(() => contract.revealPeriodActive.call(pollID))
            .then((result) => assert.equal(result, true, "Poll wasn't in reveal"))
            .then(() => contract.validPollID.call(pollID))
            .then((result) => assert.equal(result, true, "Poll isn't valid in reveal period"));
    });

    it("valid poll IDs when in ended period", function() {
        // Check if the started polls that have ended are valid,
        let pollID;
        let contract;
        let commitDuration;
        let revealDuration;
        return launchPoll("reveal period test") 
            .then((id) => pollID = id)
            .then(() => getVoteContract())
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((dur) => commitDuration = dur)
            .then(() => contract.revealDuration.call())
            .then((dur) => revealDuration = dur)
            .then(() => increaseTime(Number(commitDuration) + Number(revealDuration)))
            .then(() => contract.validPollID.call(pollID))
            .then((result) => assert.equal(result, true, "Poll isn't valid in reveal period"));
    });

    it("should allow trusted user1 to update commit duration to 1000s", () => {
        // Check if setting the commit duration updates said variable
        let vote;

        return getVoteContract()
            .then((voteInstance) => vote = voteInstance)
            .then(() => vote.setCommitDuration(1000, {from: user1}))
            .then(() => vote.commitDuration.call())
            .then((duration) => assert.equal(duration, 1000, "Commit duration was not updated correctly"));
    });

    it("should not allow untrusted user7 to set commit duration to 420s", () => {
        let vote;

        return getVoteContract()
            .then((voteInstance) => vote = voteInstance)
            .then(() => vote.setCommitDuration(420, {from: user7}))
            .then(() => assert.ok(false, "Commit duration was updated"))
            .catch((err) => vote.commitDuration.call())
            .then((duration) => assert.equal(duration, 1000, "Commit duration was updated incorrectly"));
    });

    it("should allow trusted user2 to update reveal duration to 2000s", () => {
        // Check if setting the commit duration updates said variable
        let vote;

        return getVoteContract()
            .then((voteInstance) => vote = voteInstance)
            .then(() => vote.setRevealDuration(2000, {from: user2}))
            .then(() => vote.revealDuration.call())
            .then((duration) => assert.equal(duration, 2000, "Reveal duration was not updated correctly"));
    });

    it("should not allow untrusted user8 to set commit duration to 420s", () => {
        let vote;

        return getVoteContract()
            .then((voteInstance) => vote = voteInstance)
            .then(() => vote.setRevealDuration(420, {from: user8}))
            .then(() => assert.ok(false, "Reveal duration was updated"))
            .catch((err) => vote.revealDuration.call())
            .then((duration) => assert.equal(duration, 2000, "Reveal duration was updated incorrectly"));
    });

    it("should allow trusted user3 to update voteQuota pct to 75", () => {
        // Check if setting the commit duration updates said variable
        let vote;

        return getVoteContract()
            .then((voteInstance) => vote = voteInstance)
            .then(() => vote.setVoteQuota(75, {from: user3}))
            .then(() => vote.voteQuota.call())
            .then((quota) => assert.equal(quota, 75, "VoteQuota was not updated correctly"));
    });

    it("should not allow untrusted user9 to update voteQuota pct to 42", () => {
        let vote;

        return getVoteContract()
            .then((voteInstance) => vote = voteInstance)
            .then(() => vote.setVoteQuota(42, {from: user9}))
            .then(() => assert.ok(false, "VoteQuota was updated"))
            .catch((err) => vote.voteQuota.call())
            .then((quota) => assert.equal(quota, 75, "VoteQuota was updated incorrectly"));
    });

    it("should check if non-revealed poll passes", () => {
        let pollID;
        let contract;
        let commitDuration;
        let revealDuration;
        return launchPoll("reveal period test") 
            .then((id) => pollID = id)
            .then(() => getVoteContract())
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((dur) => commitDuration = dur)
            .then(() => contract.revealDuration.call())
            .then((dur) => revealDuration = dur)
            .then(() => increaseTime(Number(commitDuration) + Number(revealDuration) + 1))
            .then(() => contract.isPassed.call(pollID))
            .then((result) => assert.equal(result, true, "non-voted poll does not pass"));
    });

    it("should check if poll with more revealed voting for proposal pass", () => {
        let pollID;
        let contract;
        let commitDuration;
        let revealDuration;
        let salt = 1;
        let voteOption = 1;
        let voteHash = createVoteHash(voteOption, salt);
        return launchPoll("reveal period test") 
            .then((id) => pollID = id)
            .then(() => getVoteContract())
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((dur) => commitDuration = dur)
            .then(() => contract.revealDuration.call())
            .then((dur) => revealDuration = dur)
            .then(() => contract.loadTokens(10, {from: accounts[1]}))
            .then(() => contract.commitVote(pollID, voteHash, 10, 0, {from:accounts[1]}))
            .then(() => increaseTime(Number(commitDuration) + 1))
            .then(() => contract.revealVote(pollID, salt, voteOption, {from: accounts[1]}))
            .then(() => increaseTime(Number(revealDuration) + 1))
            .then(() => contract.isPassed.call(pollID))
            .then((result) => assert.equal(result, true, "once voted for poll does not pass"));
    });

    it("should check if poll with more revealed voting against proposal does not pass", () => {
        let pollID;
        let contract;
        let commitDuration;
        let revealDuration;
        let salt = 1;
        let voteOption = 0;
        let voteHash = createVoteHash(voteOption, salt);
        return launchPoll("reveal period test") 
            .then((id) => pollID = id)
            .then(() => getVoteContract())
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((dur) => commitDuration = dur)
            .then(() => contract.revealDuration.call())
            .then((dur) => revealDuration = dur)
            .then(() => contract.loadTokens(10, {from: accounts[1]}))
            .then(() => contract.commitVote(pollID, voteHash, 10, 0, {from:accounts[1]}))
            .then(() => increaseTime(Number(commitDuration) + 1))
            .then(() => contract.revealVote(pollID, salt, voteOption, {from: accounts[1]}))
            .then(() => increaseTime(Number(revealDuration) + 1))
            .then(() => contract.isPassed.call(pollID))
            .then((result) => assert.equal(result, false, "once voted against poll does pass"));
    });

    it("should check if poll with multiple more revealed votes for proposal does pass", () => {
        let pollID;
        let contract;
        let commitDuration;
        let revealDuration;

        let saltUser1 = 1;
        let voteOptionUser1 = 1;
        let voteHashUser1 = createVoteHash(voteOptionUser1, saltUser1);
        
        let saltUser2 = 2;
        let voteOptionUser2 = 0;
        let voteHashUser2 = createVoteHash(voteOptionUser2, saltUser2);

        let saltUser3 = 3;
        let voteOptionUser3 = 0;
        let voteHashUser3 = createVoteHash(voteOptionUser3, saltUser3);

        return launchPoll("reveal period test") 
            .then((id) => pollID = id)
            .then(() => getVoteContract())
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((dur) => commitDuration = dur)
            .then(() => contract.revealDuration.call())
            .then((dur) => revealDuration = dur)

            // load tokens for users
            .then(() => contract.loadTokens(70, {from: accounts[1]}))
            .then(() => contract.loadTokens(20, {from: accounts[2]}))
            .then(() => contract.loadTokens(10, {from: accounts[3]}))

            // commitVote for multiple users
            .then(() => contract.commitVote(pollID, voteHashUser1, 70, 0, {from:accounts[1]}))
            .then(() => contract.commitVote(pollID, voteHashUser2, 20, 0, {from:accounts[2]}))
            .then(() => contract.commitVote(pollID, voteHashUser3, 10, 0, {from:accounts[3]}))

            // get time to reveal period
            .then(() => increaseTime(Number(commitDuration) + 1))

            // reveal vote for multiple users
            .then(() => contract.revealVote(pollID, saltUser1, voteOptionUser1, {from: accounts[1]}))
            .then(() => contract.revealVote(pollID, saltUser2, voteOptionUser2, {from: accounts[2]}))
            .then(() => contract.revealVote(pollID, saltUser3, voteOptionUser3, {from: accounts[3]}))

            .then(() => increaseTime(Number(revealDuration) + 1))
            .then(() => contract.isPassed.call(pollID))
            .then((result) => assert.equal(result, true, "poll with more votes revealed for does not pass"));
    });

    it("should check if getNumCorrectVote returns number of correctly voted tokens", () => {
        let pollID;
        let contract;
        let commitDuration;
        let revealDuration;

        let saltUser1 = 1;
        let voteOptionUser1 = 1;
        let voteHashUser1 = createVoteHash(voteOptionUser1, saltUser1);
        
        let saltUser2 = 2;
        let voteOptionUser2 = 0;
        let voteHashUser2 = createVoteHash(voteOptionUser2, saltUser2);

        let saltUser3 = 3;
        let voteOptionUser3 = 0;
        let voteHashUser3 = createVoteHash(voteOptionUser3, saltUser3);

        let correctVote = 30;

        return launchPoll("getNumCorrectVote test") 
            .then((id) => pollID = id)
            .then(() => getVoteContract())
            .then((instance) => contract = instance)
            .then(() => contract.commitDuration.call())
            .then((dur) => commitDuration = dur)
            .then(() => contract.revealDuration.call())
            .then((dur) => revealDuration = dur)

            // load tokens for users
            .then(() => contract.loadTokens(30, {from: accounts[4]}))
            .then(() => contract.loadTokens(10, {from: accounts[2]}))
            .then(() => contract.loadTokens(5, {from: accounts[3]}))

            // commitVote for multiple users
            .then(() => contract.commitVote(pollID, voteHashUser1, correctVote, 0, {from:accounts[4]}))
            .then(() => contract.commitVote(pollID, voteHashUser2, 10, 0, {from:accounts[2]}))
            .then(() => contract.commitVote(pollID, voteHashUser3, 5, 0, {from:accounts[3]}))

            // get time to reveal period
            .then(() => increaseTime(Number(commitDuration) + 1))

            // reveal vote for multiple users
            .then(() => contract.revealVote(pollID, saltUser1, voteOptionUser1, {from: accounts[4]}))
            .then(() => contract.revealVote(pollID, saltUser2, voteOptionUser2, {from: accounts[2]}))
            .then(() => contract.revealVote(pollID, saltUser3, voteOptionUser3, {from: accounts[3]}))
            .then(() => increaseTime(Number(revealDuration) + 1))
            .then(() => contract.getNumCorrectVote.call(pollID, saltUser1, {from: accounts[4]}))
            .then((num) => assert.equal(Number(num), correctVote, "getNumCorrectVote returns wrong number"))
        
    });
});