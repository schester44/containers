class ContainerTui < Formula
  desc "Docker-Desktop-like TUI for Apple containers"
  homepage "https://github.com/schester44/container-tui"
  license "MIT"
  head "https://github.com/schester44/container-tui.git", branch: "main"

  # After tagging a release (e.g. `git tag v0.1.0 && git push --tags`),
  # uncomment these lines and fill in the sha256:
  #   curl -L https://github.com/schester44/container-tui/archive/refs/tags/v0.1.0.tar.gz | shasum -a 256
  # url "https://github.com/schester44/container-tui/archive/refs/tags/v0.1.0.tar.gz"
  # sha256 "REPLACE_WITH_TARBALL_SHA256"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      Requires the Apple `container` CLI:
        brew install container
        container system start
    EOS
  end

  test do
    assert_path_exists bin/"tainer"
  end
end
