var rUtil = require('../../lib/requestUtil'),
    DOCS_LINK_DOMAIN = "";

module.exports.Create = function (req, res, next) {
    try {
        if (!checkPermission(req, res)) return;

        var domain_name = req.body.domain_name,
            customer_id = req.body.customer_id,
            parameters = req.body.parameters,
            variables = req.body.variables
        ;
        if (domain_name && customer_id) {
            if (!webitel.doSendCommandV2(res)) return;
            webitel.domainCreate(null, domain_name, customer_id, {
                "parameters": parameters,
                "variables": variables
            }, function (request) {
                res.status(200).json(rUtil.getRequestObject((request['body'] && request['body'].indexOf('-ERR') == 0)
                    ? "error" : "OK", request['body'], DOCS_LINK_DOMAIN));
            });
        } else {
            res.status(400).json(rUtil.getRequestObject('error', 'domain_name or customer_id undefined.', DOCS_LINK_DOMAIN));
        }
    } catch (e) {
        next(e)
    };
};

module.exports.GetItem = function (req, res, next) {
    try {
        var domain_name = (req.params && req.params.name)
            ? req.params.name
            : '';

        if (domain_name != '') {
            if (!webitel.doSendCommandV2(res)) return;
            webitel.domainItem(req.webitelUser, domain_name, function(request) {
                //rUtil.getRequestObject('OK', request.body, DOCS_LINK_DOMAIN
                if (typeof request['body'] === 'string') {
                    res.status(200).json({
                        "status": "error",
                        "info": request.body,
                        "more info": DOCS_LINK_DOMAIN
                    });
                } else {
                    res.status(200).json({
                        "status": "OK",
                        "data": request.body,
                        "more info": DOCS_LINK_DOMAIN
                    });
                };
            });
        } else {
            res.status(400).json(rUtil.getRequestObject('error', 'domain_name undefined.', DOCS_LINK_DOMAIN));
        }

    } catch (e) {
        next(e);
    }
};

module.exports.Update = function (req, res, next) {
    try {

        var domain_name = (req.params && req.params.name)
                ? req.params.name
                : '',
            type = req.params.type
            ;

        if (domain_name != '' || !(req.body instanceof Array)) {
            if (!webitel.doSendCommandV2(res)) return;
            webitel.updateDomain(req['webitelUser'], domain_name, {
                "type": type,
                "params": req.body
            }, function(request) {
                res.status(200).json(rUtil.getRequestObject('OK', request.body, DOCS_LINK_DOMAIN));
            });
        } else {
            res.status(400).json(rUtil.getRequestObject('error', 'bad request.', DOCS_LINK_DOMAIN));
        };

    } catch (e) {
        next(e);
    }
};

module.exports.Delete = function (req, res, next) {
    try {
        if (!checkPermission(req, res)) return;

        var domain_name = (req.params && req.params.name)
                ? req.params.name
                : '';
        if (domain_name != '') {
            if (!webitel.doSendCommandV2(res)) return;
            webitel.domainRemove(null, domain_name, function(request) {
                res.status(200).json(rUtil.getRequestObject('OK', request.body, DOCS_LINK_DOMAIN));
            });
        } else {
            res.status(400).json(rUtil.getRequestObject('error', 'domain_name undefined.', DOCS_LINK_DOMAIN));
        }
    } catch (e) {
        next(e)
    };
};

module.exports.Get = function (req, res, next) {
    if (!checkPermission(req, res)) return;

    webitel.domainList(null, null, function (response) {
        try {
            if (response['body'].indexOf('-ERR') == 0) {
                res.status(200).json(rUtil.getRequestObject('error', response['body'], DOCS_LINK_DOMAIN));
                return;
            };

            webitel._parsePlainTableToJSON(response.getBody(), null, function (err, data) {
                if (err) {
                    res.status(200).json(rUtil.getRequestObject('OK', err.message, DOCS_LINK_DOMAIN));
                    return;
                };

                res.status(200).json({
                    "status": "OK",
                    "data": data
                });
            });
        } catch (e) {
            log.error(e.message);
        };
    });
};

function checkPermission (req, res) {
    if (!req.webitelUser || req.webitelUser['attr']['role']['val'] !== 2 ) {
        res.status(403).json(rUtil.getRequestObject('error', '-ERR permission denied!', DOCS_LINK_DOMAIN));
        return false;
    };
    return true;
};