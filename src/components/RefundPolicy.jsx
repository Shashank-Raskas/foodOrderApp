import PolicyDocument from './UI/PolicyDocument';
// The text lives in content/ so the site and the support chatbot share one source
import source from '../../content/refund-policy.md?raw';

export default function RefundPolicy() {
  return <PolicyDocument source={source} />;
}
