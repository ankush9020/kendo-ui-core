namespace Kendo.Mvc.UI.Tests
{
    using System.Collections.Generic;
    using Xunit;

    public class PDFSettingsTests
    {
        private readonly PDFSettings pdf;

        public PDFSettingsTests()
        {
            pdf = new PDFSettings();
        }

        [Fact]
        public void Serializes_forceProxy()
        {
            pdf.ForceProxy = true;
            pdf.ToJson()["forceProxy"].ShouldEqual(true);
        }

        [Fact]
        public void Does_not_serialize_default_forceProxy()
        {
            pdf.ToJson().ContainsKey("forceProxy").ShouldBeFalse();
        }

        [Fact]
        public void Serializes_proxyURL()
        {
            pdf.ProxyURL = "foo";
            pdf.ToJson()["proxyURL"].ShouldEqual("foo");
        }

        [Fact]
        public void Serializes_allPages()
        {
            pdf.AllPages = true;
            pdf.ToJson()["allPages"].ShouldEqual(true);
        }

        [Fact]
        public void Does_not_serialize_default_allPages()
        {
            pdf.ToJson().ContainsKey("allPages").ShouldBeFalse();
        }

        [Fact]
        public void Serializes_avoidLinks_bool()
        {
            pdf.AvoidLinks = true;
            pdf.ToJson()["avoidLinks"].ShouldEqual(true);
        }

        [Fact]
        public void Serializes_avoidLinks_string()
        {
            pdf.AvoidLinks = "a";
            pdf.ToJson()["avoidLinks"].ShouldEqual("a");
        }

        [Fact]
        public void Does_not_serialize_default_avoidLinks()
        {
            pdf.ToJson().ContainsKey("avoidLinks").ShouldBeFalse();
        }

        [Fact]
        public void Does_not_serialize_default_proxyURL()
        {
            pdf.ToJson().ContainsKey("proxyURL").ShouldBeFalse();
        }

        [Fact]
        public void Serializes_proxyTarget()
        {
            pdf.ProxyTarget = "foo";
            pdf.ToJson()["proxyTarget"].ShouldEqual("foo");
        }

        [Fact]
        public void Does_not_serialize_default_proxyTarget()
        {
            pdf.ToJson().ContainsKey("proxyTarget").ShouldBeFalse();
        }
    }
}