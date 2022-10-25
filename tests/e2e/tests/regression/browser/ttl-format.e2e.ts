import { Selector } from 'testcafe';
import { acceptLicenseTermsAndAddDatabaseApi } from '../../../helpers/database';
import { keyTypes } from '../../../helpers/keys';
import { rte, COMMANDS_TO_CREATE_KEY, keyLength } from '../../../helpers/constants';
import { BrowserPage, CliPage } from '../../../pageObjects';
import { commonUrl, ossStandaloneConfig } from '../../../helpers/conf';
import { deleteStandaloneDatabaseApi } from '../../../helpers/api/api-database';
import { Common } from '../../../helpers/common';

const browserPage = new BrowserPage();
const cliPage = new CliPage();
const common = new Common();

const keyName = common.generateWord(20);
const keysData = keyTypes.map(object => ({ ...object })).slice(0, 6);
for (const key of keysData) {
    key.keyName = `${key.keyName}` + '-' + `${common.generateWord(keyLength)}`;
}
// Arrays with TTL in seconds, min, hours, days, months, years and their values in Browser Page
const ttlForSet = [59, 800, 20000, 2000000, 31000000, 2147483647];
const ttlValues = ['s', '13 min', '5 h', '23 d', '11 mo', '68 yr'];

fixture `TTL values in Keys Table`
    .meta({
        type: 'regression',
        rte: rte.standalone
    })
    .page(commonUrl)
    .beforeEach(async() => {
        await acceptLicenseTermsAndAddDatabaseApi(ossStandaloneConfig, ossStandaloneConfig.databaseName);
    })
    .afterEach(async() => {
        // Clear and delete database
        for (let i = 0; i < keysData.length; i++) {
            await browserPage.deleteKey();
        }
        await deleteStandaloneDatabaseApi(ossStandaloneConfig);
    });
test('Verify that user can see TTL in the list of keys rounded down to the nearest unit', async t => {
    // Create new keys with TTL
    await t.click(cliPage.cliExpandButton);
    for (let i = 0; i < keysData.length; i++) {
        await t.typeText(cliPage.cliCommandInput, COMMANDS_TO_CREATE_KEY[keysData[i].textType](keysData[i].keyName), {paste: true})
            .pressKey('enter')
            .typeText(cliPage.cliCommandInput, `EXPIRE ${keysData[i].keyName} ${ttlForSet[i]}`, {paste: true})
            .pressKey('enter');
    }
    await t.click(cliPage.cliCollapseButton);
    // Refresh Keys in Browser
    await t.click(browserPage.refreshKeysButton);
    // Check that Keys has correct TTL value in keys table
    for (let i = 0; i < keysData.length; i++) {
        const ttlValueElement = Selector(`[data-testid="ttl-${keysData[i].keyName}"]`);
        await t.expect(ttlValueElement.textContent).contains(ttlValues[i], `TTL value in keys table is not ${ttlValues[i]}`);
    }
});
test
    .after(async() => {
        await deleteStandaloneDatabaseApi(ossStandaloneConfig);
    })('Verify that Key is deleted if TTL finishes', async t => {
        // Create new key with TTL
        const TTL = 15;
        let ttlToCompare = TTL;
        await browserPage.addStringKey(keyName, 'test', TTL.toString());
        await t.click(browserPage.refreshKeysButton);
        await t.expect(await browserPage.isKeyIsDisplayedInTheList(keyName)).ok('Key not added');
        // Specify selector with TTL
        const ttlValueElement = Selector(`[data-testid="ttl-${keyName}"]`);
        // Check that TTL reduces every page refresh
        while (await browserPage.isKeyIsDisplayedInTheList(keyName)) {
            const actualTTL = Number((await ttlValueElement.innerText).slice(0, -2));
            await t.expect(actualTTL).lte(ttlToCompare, 'Wrong TTL displayed');
            await t.click(browserPage.refreshKeysButton);
            ttlToCompare = actualTTL;
        }
        // Check that key with finished TTL is deleted
        await t.click(browserPage.refreshKeysButton);
        await t.expect(await browserPage.isKeyIsDisplayedInTheList(keyName)).notOk('Key is still displayed');
    });
