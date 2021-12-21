
const fs = require('fs');
const decode_int = (b, start, end) =>
{
    let s = '';
    for (let i = start; i < end; ++i)
        s = b.slice(i, i+1).toString('hex') + s;

    return parseInt(s, 16);
}

const decode_hex = (b, start, end) =>
{
    return b.slice(start, end).toString('hex')
}

const decode_ip = (b, start, end) =>
{
    let s = decode_hex(b, start, end);
    if (s.substr(0, 24) == '00000000000000000000ffff')
    {
        let ip = '';
        for (let i = 0; i < 4; ++i)
        {
            ip += parseInt(s.substr(i * 2 + 24, 2), 16);
            if (i != 3) ip += '.';
        }
        return ip;
    }
    return s;
}

const encode_int  = (i, byte_size)=>
{
    let out = "";
    for (let x = 0; x < byte_size; ++x)
    {
        let b = (i % 256).toString(16);
        i >>= 8;
        if (b.length < 2) b = "0" + b;
        out += b;
    }
    if (i > 0)
        throw("encode_int number too big for field");
    return out;
}

const decode_message = (buf, len) =>
{

    let flags =         decode_int(buf,   0,  4);

    if ((flags >> 28) == 0)
    {
        let header = {
            flags         : decode_int(buf,   0,   4),
            size          : decode_int(buf,   4,   8),
            timestamp     : decode_int(buf,   8,  12),
            type          : decode_int(buf,  12,  14),
            port          : decode_int(buf,  14,  16),
            addr          : decode_ip (buf,  16,  32),
            hash          : decode_hex(buf,  32,  64),
            source_peer   : decode_hex(buf,  64,  96),
            dest_peer     : decode_hex(buf,  96, 128)
        };

        let payload =       buf.slice(128, len);

        return {
            message_type: flags >> 28,
            header: header,
            payload: payload
        };
    }

    return false;
};


const read_message = (fd) =>
{
    let buf = Buffer.alloc(1024*1024*10); // max 10 mib
    let bytes_read = fs.readSync(fd, buf);
    return decode_message(buf, bytes_read);
}

const message_types = {
    MANIFESTS : 2,
    PING :  3,
    CLUSTER :  5,
    ENDPOINTS :  15,
    TRANSACTION :  30,
    GET_LEDGER :  31,
    LEDGER_DATA :  32,
    PROPOSE_LEDGER :  33,
    STATUS_CHANGE :  34,
    HAVE_SET :  35,
    VALIDATION :  41,
    GET_OBJECTS :  42,
    GET_SHARD_INFO :  50,
    SHARD_INFO :  51,
    GET_PEER_SHARD_INFO :  52,
    PEER_SHARD_INFO :  53,
    VALIDATORLIST :  54,
    SQUELCH :  55,
    VALIDATORLISTCOLLECTION :  56,
    PROOF_PATH_REQ :  57,
    PROOF_PATH_RESPONSE :  58,
    REPLAY_DELTA_REQ :  59,
    REPLAY_DELTA_RESPONSE :  60,
    GET_PEER_SHARD_INFO_V2 :  61,
    PEER_SHARD_INFO_V2 :  62,
    HAVE_TRANSACTIONS :  63,
    TRANSACTIONS :  64
};

module.exports = {
    decode_hex: decode_hex,
    decode_int: decode_int,
    encode_int: encode_int,
    decode_msg: decode_message,
    read_msg: read_message,
    mt: message_types
};
