/**
 * Created by i.navrotskyj on 09.02.2015.
 */

module.exports = function (app) {
    // REST V1
    app.all('/api/v1/*', require('./baseAuth'));
    /* DOMAIN */
    app.post('/api/v1/domains?', require('./domain').Create);
    app.delete('/api/v1/domains?/:name', require('./domain').Delete);
    /* ACCOUNT */
    app.post('/api/v1/accounts?', require('./account').Create);
    /* CONFIGURE */
    app.get('/api/v1/reloadxml', require('./configure').ReloadXml);
};