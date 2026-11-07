import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles.css';
import { mountHeader } from './components/header/header.js';
import { mountFooter } from './components/footer/footer.js';
import { startRouter } from './router.js';
import { initToasts } from './utils/toast.js';

initToasts();

const header = mountHeader(document.getElementById('site-header'));
mountFooter(document.getElementById('site-footer'));

startRouter({
  outlet: document.getElementById('app'),
  onNavigate: (pathname) => header.setActive(pathname),
});
