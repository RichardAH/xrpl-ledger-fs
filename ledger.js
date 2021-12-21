
const buffer_size = 1024*1024;
const sock_path = "/var/run/xrpl-uplink/subscriber.sock";

const xf = require('xrpl-fetch-unl')
const us = require('unix-seqpacket');
const fs = require('fs');
const up = require('./uplink-codec.js')
const pb = require('protobufjs')
const bc = require('ripple-binary-codec')
const ra = require('ripple-address-codec')


pb.load("ripple.proto", (err, root) =>
{
    if (err)
        throw err;

    const TMValidation  = root.lookupType("protocol.TMValidation");
    const TMGetLedger   = root.lookupType("protocol.TMGetLedger");
    const TMLedgerData  = root.lookupType("protocol.TMLedgerData");

    const liBASE = 0;
    const liTX_NODE = 1;
    const liAS_NODE = 2;
    const liTS_CANDIDATE = 3;
    const ltACCEPTED      = 0;
    const ltCLOSED        = 2;
    const create_req = (ledger_seq, itype, depth, ltype, node_ids = []) =>
    {
        return TMGetLedger.encode(TMGetLedger.fromObject(
        {
            itype: itype,
            ltype: ltype,
            ledgerSeq: ledger_seq,
            nodeIDs: node_ids,
            queryDepth: depth,
            requestCookie: (ledger_seq << 32) + (Math.floor(Date.now()/1000))
        })).finish();
    };

    let validated = {}; // ledger_seq -> validated_ledger_hash
    const process_nodes = (msg) =>
    {
        console.log("LedgerData");
        console.log(msg);
        try
        {
            let resp = TMLedgerData.decode(msg.payload);

            console.log(resp);
        } catch (e) { console.log(e) }
    };

/*

enum TMLedgerInfoType
{
    liBASE          = 0;        // basic ledger info
    liTX_NODE       = 1;        // transaction node
    liAS_NODE       = 2;        // account state node
    liTS_CANDIDATE  = 3;        // candidate transaction set
}

 */

    let votes = {};     // ledger_seq -> ledger_hash -> agreement count
    const process_validation = (unl, quorum, msg) =>
    {
        try
        {
            let v = TMValidation.decode(msg.payload);
            let m = bc.decode(v.validation.toString('hex'));

            let seq = m.LedgerSequence
            let hash = m.LedgerHash

            if (seq in validated && validated[seq] == hash)
                return;

            m['node'] = ra.encodeNodePublic(Buffer.from(m.SigningPubKey, 'hex'))
            if (m.node in unl)
            {
                let verified = unl[m.node].verify_validation(v.validation)
                if (verified._verified)
                {
                    // m is a validly signed UNL validation

                    if (!votes[seq])
                        votes[seq] = {}

                    if (!votes[seq][hash])
                        votes[seq][hash] = 1;
                    else
                        votes[seq][hash]++;

                    if (votes[seq][hash] >= quorum)
                    {
                        validated[seq] = hash
                        votes = {};

                        console.log("Ledger: " + seq + "/" + hash, "validated");

                        // put in fetch requests to get this ledger
                        let payload = create_req(seq-1, liBASE, 2, 0);
                        up.write_msg(
                            fd,
                            (2 << 16) +     // routing mode = 2 (send to random peers)
                            20,              // count = 2        (i.e. 2 random peers)
                            up.mt.GET_LEDGER,
                            payload);

                        /*
                        payload = create_req(seq-2, liBASE, 2, 0);
                        up.write_msg(
                            fd,
                            (2 << 16) +     // routing mode = 2 (send to random peers)
                            10,              // count = 2        (i.e. 2 random peers)
                            up.mt.GET_LEDGER,
                            payload);
                            */
                    }
                }
            }
        }
        catch (e)
        {
            console.log("error decoding TMValidation:", e);
            return;
        }
    };

    let fd = us.open(sock_path); // throws on failure

    // RH TODO: every 5 minutes pull down a new UNL
    xf.fetch_validated_unl('https://vl.xrplf.org').then(unl =>
    {
        delete unl.vl;
        console.log(unl);

        const quorum = 0.81 * Object.keys(unl).length;

        // message loop
        while(true)
        {
            let msg = up.read_msg(fd);
            if (!msg)
                break;
            if (msg.header.type == up.mt.LEDGER_DATA)
                process_nodes(msg);
            else if (msg.header.type == up.mt.VALIDATION)
                process_validation(unl, quorum, msg);
        }
    }).catch(e =>
    {
        console.log("error", e);

    });
});
