import PolicyDocument from './UI/PolicyDocument';
// The text lives in content/ so the site and the support chatbot share one source
import source from '../../content/privacy-policy.md?raw';

export default function PrivacyPolicy() {
  return <PolicyDocument source={source} />;
}
