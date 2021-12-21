
const buffer_size = 1024*1024;
const sock_path = "/var/run/xrpl-uplink/subscriber.sock";

const xf = require('xrpl-fetch-unl')
const us = require('unix-seqpacket');
const fs = require('fs');
const up = require('./uplink-codec.js')
const pb = require('protobufjs')
const bc = require('ripple-binary-codec')
const ra = require('ripple-address-codec')


const request_ledger = ( ) =>
{
};

pb.load("ripple.proto", (err, root) =>
{
    if (err)
        throw err;

    const TMValidation = root.lookupType("protocol.TMValidation");

    let fd = us.open(sock_path); // throws on failure

    // RH TODO: every 5 minutes pull down a new UNL
    xf.fetch_validated_unl('https://vl.xrplf.org').then(unl =>
    {
        delete unl.vl;
        console.log(unl);

        const quorum = 0.81 * Object.keys(unl).length;

        let votes = {}; // ledger_seq -> ledger_hash -> agreement count
        let validated = {}; // ledger_seq -> validated_ledger_hash

        // message loop
        while(true)
        {
            let msg = up.read_msg(fd);
            if (!msg)
                continue;
            if (msg.header.type == up.mt.VALIDATION)
            {
                try
                {
                    let v = TMValidation.decode(msg.payload);
                    let m = bc.decode(v.validation.toString('hex'));

                    let seq = m.LedgerSequence
                    let hash = m.LedgerHash

                    if (seq in validated && validated[seq] == hash)
                        continue;
                   
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

                        
                            console.log(m)
                            if (votes[seq][hash] >= quorum)
                            {
                                validated[seq] = hash
                                votes = {};

                                console.log("Ledger: " + seq + "/" + hash, "validated");

                                // put in fetch requests to get this ledger

                            }

                        }
                    }
                }
                catch (e)
                {
                    console.log("error decoding TMValidation:", e);
                    continue;
                }
            }
        }
    }).catch(e =>
    {
        console.log("error", e);

    });
});
