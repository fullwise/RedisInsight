import { render, screen } from 'uiSrc/utils/test-utils';
import JSONView from './JSONView';
describe('JSONViewer', function () {
    it('should render proper json', function () {
        var jsx = JSONView({ value: JSON.stringify({}) });
        render(jsx.value);
        expect(jsx.isValid).toBeTruthy();
        expect(screen.queryByTestId('value-as-json')).toBeInTheDocument();
    });
    it('should not render invalid json', function () {
        var jsx = JSONView({ value: 'zxc' });
        expect(jsx.value).toEqual('zxc');
        expect(jsx.isValid).toBeFalsy();
    });
});
//# sourceMappingURL=JSONView.spec.js.map