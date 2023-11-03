import { t } from 'testcafe';
import { DatabaseHelper } from '../../../../helpers/database';
import { WorkbenchPage, MyRedisDatabasePage } from '../../../../pageObjects';
import { commonUrl, ossStandaloneConfig } from '../../../../helpers/conf';
import { ExploreTabs, rte } from '../../../../helpers/constants';
import { DatabaseAPIRequests } from '../../../../helpers/api/api-database';

const myRedisDatabasePage = new MyRedisDatabasePage();
const workbenchPage = new WorkbenchPage();
const databaseHelper = new DatabaseHelper();
const databaseAPIRequests = new DatabaseAPIRequests();

const keyNameGraph = 'bikes_graph';

fixture `Redis Stack command in Workbench`
    .meta({ type: 'regression', rte: rte.standalone })
    .page(commonUrl)
    .beforeEach(async t => {
        await databaseHelper.acceptLicenseTermsAndAddDatabaseApi(ossStandaloneConfig);
        await t.click(myRedisDatabasePage.NavigationPanel.workbenchButton);
    })
    .afterEach(async() => {
        // Drop key and database
        await t.switchToMainWindow();
        await workbenchPage.sendCommandInWorkbench(`GRAPH.DELETE ${keyNameGraph}`);
        await databaseAPIRequests.deleteStandaloneDatabaseApi(ossStandaloneConfig);
    });
test('Verify that user can switches between Chart and Text for TimeSeries command and see results corresponding to their views', async t => {
    // Send TimeSeries command
    await workbenchPage.InsightsPanel.togglePanel(true);
    const tutorials = await workbenchPage.InsightsPanel.setActiveTab(ExploreTabs.Explore);
    await t.click(tutorials.redisStackTutorialsButton);
    await t.click(tutorials.timeSeriesLink);
    await tutorials.runBlockCode('Show all sales per region');
    // Check result is in chart view
    await t.expect(workbenchPage.chartViewTypeOptionSelected.exists).ok('The chart view option is not selected by default');
    // Switch to Text view and check result
    await workbenchPage.selectViewTypeText();
    await t.expect(workbenchPage.queryCardContainer.nth(0).find(workbenchPage.cssQueryTextResult).exists).ok('The result in text view is not displayed');
});
